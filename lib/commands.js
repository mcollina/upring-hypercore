'use strict'

const path = require('path')
const hypercore = require('hypercore')
const ns = 'ringcore'

function commands (that) {
  const feeds = new Map()
  const root = that.root
  const upring = that.upring
  const logger = upring.logger
  const valueEncoding = that.encoding

  that._feeds = feeds

  function getFeed (key) {
    var feed = feeds.get(key)

    if (!feed) {
      // TODO sanitize key to be used in the fs
      // security hell might unleash
      const feedPath = path.join(root, key)
      logger.info({ feedPath, key, valueEncoding }, 'creating new feed')

      feed = hypercore(feedPath, { valueEncoding })

      feeds.set(key, feed)
    }

    return feed
  }

  upring.add({
    cmd: 'createWriteStream',
    ns
  }, function (req, reply) {
    const key = req.key

    const feed = getFeed(key)

    reply(null, {
      streams: {
        write: feed.createWriteStream()
      }
    })
  })

  upring.add({
    cmd: 'createReadStream',
    ns
  }, function (req, reply) {
    const key = req.key

    const feed = getFeed(key)

    reply(null, {
      streams: {
        read: feed.createReadStream(req)
      }
    })
  })

  upring.add({
    cmd: 'replicate',
    ns
  }, function (req, reply) {
    const key = req.key

    const feed = getFeed(key)

    feed.ready(function () {
      reply(null, {
        streams: {
          replicate: feed.replicate({ live: true })
        }
      })
    })
  })

  upring.add({
    cmd: 'info',
    ns
  }, function (req, reply) {
    const key = req.key

    const feed = feeds.get(key)

    if (!feed) {
      reply(new Error('not found'))
      return
    }

    feed.ready(function () {
      reply(null, {
        hypercore: {
          key: feed.key.toString('hex')
        }
      })
    })
  })

  upring.add({
    cmd: 'append',
    ns
  }, function (req, reply) {
    const key = req.key

    const feed = getFeed(key)

    feed.append(req.value, reply)
  })
}

module.exports = commands
