var difference = require('lodash/difference')
var hijackResponse = require('hijackresponse')
var mount = require('./mount-middleware')
var streamBuffers = require('stream-buffers')

require('express-negotiate')

var requestHeaderWhitelist = [
  'host',
  'x-forwarded-host',
  'x-forwarded-proto'
]

var responseHeaderWhitelist = [
  'link',
  'set-cookie'
]

function middleware (options) {
  return function (req, res, next) {
    req.negotiate({
      html: function () {
        // remove all request header sent from the client which are not required
        difference(Object.keys(req.headers), requestHeaderWhitelist).forEach(function (name) {
          delete req.headers[name]
        })

        // set html middleware request headers for the handler
        req.headers['accept'] = options.render.accept

        hijackResponse(res, function (err, res) {
          if (err) {
            res.unhijack()

            return next(err)
          }

          // add missing next in hijacked req
          req.next = function (err) {
            res.unhijack()

            next(err)
          }

          var graphBuffer = new streamBuffers.WritableStreamBuffer()

          graphBuffer.on('finish', function () {
            var graphString = graphBuffer.getContentsAsString('utf8')

            // don't process graph if it's bigger than graphSizeLimit
            if (options.graphSizeLimit && (graphString || '').length > options.graphSizeLimit) {
              res.status(413)
            } else {
              res.locals.graph = graphString
            }

            // remove all response headers sent from handler
            if (res._headers) {
              difference(Object.keys(res._headers), responseHeaderWhitelist).forEach(function (name) {
                res.removeHeader(name)
              })
            }

            // set new response headers
            res.setHeader('content-type', 'text/html')

            // use renderer to build body
            if (res.statusCode === 200) {
              options.render(req, res)
            } else {
              // use .error method if renderer has one
              if (options.render.error) {
                options.render.error(req, res)
              } else {
                options.render(req, res)
              }
            }
          })

          res.pipe(graphBuffer)
        })

        next()
      },

      default: function () {
        next()
      }
    })
  }
}

function factory (router, options) {
  // load render module and forward options to the factory
  options.render = require(options.module)(options)

  router.use(middleware(options))
}

factory.all = function (router, options) {
  return mount.all(router, options, function (options) {
    // load render module and forward options to the factory
    options.render = require(options.module)(options)

    return middleware(options)
  })
}

factory.middleware = middleware

module.exports = factory
