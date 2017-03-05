'use strict'

const UpRing = require('upring')
const commands = require('./lib/commands')
const through = require('through2')
const pump = require('pump')
const mkdirp = require('mkdirp')
const steed = require('steed')
const ns = 'ringcore'

function RingCore (opts) {
  if (!(this instanceof RingCore)) {
    return new RingCore(opts)
  }

  this.upring = opts.upring || new UpRing(opts)

  // expose the parent logger
  this.logger = this.upring.logger

  this._ready = false
  this.closed = false
  this.root = opts.root

  if (!this.root) {
    throw new Error('missing root directory to store the feeds')
  }

  this.logger.debug({ root: this.root }, 'creating root folder if missing')
  mkdirp.sync(this.root)

  this.encoding = opts.encoding || 'json'

  commands(this)

  this.upring.on('up', () => {
    this._ready = true
  })
}

RingCore.prototype.createWriteStream = function (key) {
  if (!key) {
    throw new Error('key must be defined')
  }

  const stream = through.obj()
  const upring = this.upring

  if (!this._ready) {
    this.upring.once('up', createWriteStreamRequest.bind(null, key, upring, stream))
  } else {
    createWriteStreamRequest(key, upring, stream)
  }

  return stream
}

function createWriteStreamRequest (key, upring, stream) {
  upring.request({
    key,
    ns,
    cmd: 'createWriteStream'
  }, function (err, res) {
    if (err) {
      stream.emit('error', err)
      return
    }

    pump(stream, res.streams.write, function (err) {
      upring.logger.debug({ key, err }, 'write stream ended')
    })
  })
}

RingCore.prototype.createReadStream = function (key, opts) {
  if (!key) {
    throw new Error('key must be defined')
  }

  const stream = through.obj()
  const upring = this.upring

  opts = opts || {}

  if (!this._ready) {
    this.upring.once('up', createReadStreamRequest.bind(null, key, opts, upring, stream))
  } else {
    createReadStreamRequest(key, opts, upring, stream)
  }

  return stream
}

function createReadStreamRequest (key, opts, upring, stream) {
  upring.request({
    key,
    ns,
    cmd: 'createReadStream',
    live: opts.live
  }, function (err, res) {
    if (err) {
      stream.emit('error', err)
      return
    }

    pump(res.streams.read, stream, function (e) {
      upring.logger.debug({ key, err }, 'read stream ended')
    })
  })
}

RingCore.prototype.replicate = function (key, feed) {
  if (!key) {
    throw new Error('key must be defined')
  }

  const logger = this.logger

  if (!this._ready) {
    this.upring.once('up', this.replicate.bind(this, key, feed))
    return
  }

  this.upring.request({
    key,
    ns,
    cmd: 'replicate'
  }, function (err, res) {
    if (err) {
      logger.info(err, 'unable to create a replication stream')
      return
    }

    const stream = feed.replicate({ live: true })
    const target = res.streams.replicate

    pump(stream, target, stream, function (e) {
      if (e) {
        logger.warn(e, 'replication stream closed')
      }
    })
  })

  return this
}

RingCore.prototype.getInfo = function (key, cb) {
  if (!key) {
    throw new Error('key must be defined')
  }

  if (!this._ready) {
    this.upring.once('up', this.getInfo.bind(this, key, cb))
    return
  }

  this.upring.request({
    ns,
    cmd: 'info',
    key
  }, cb)
}

RingCore.prototype.close = function (cb) {
  cb = cb || noop
  if (!this._ready) {
    this.upring.once('up', this.close.bind(this, cb))
    return
  }

  if (this.closed) {
    cb()
    return
  }

  this.closed = true

  // we close upring first so all streams are down
  this.upring.close((err) => {
    // then we shut down all the feeds
    steed.each(this._feeds, (feed, cb) => feed.close(cb), () => {
      cb(err)
    })
  })
}

function noop () {}

module.exports = RingCore
