'use strict'

const t = require('tap')
const test = t.test
const RingCore = require('.')
const joinTimeout = 200
const hypercore = require('hypercore')
const os = require('os')
const path = require('path')
const ram = require('random-access-memory')
const rimraf = require('rimraf')

function build (main) {
  const base = []

  if (main && main.whoami) {
    base.push(main.whoami())
  }

  const root = path.join(os.tmpdir(), 'basic')

  rimraf.sync(root)

  return RingCore({
    base,
    root,
    logLevel: 'fatal',
    valueEncoding: 'json',
    hashring: {
      joinTimeout
    }
  })
}

build.joinTimeout = joinTimeout

const instance = build()

t.tearDown(instance.close.bind(instance))

test('demo core', function (t) {
  t.plan(3)

  const feed1 = hypercore(function (filename) {
    return ram()
  })

  feed1.append('hello', function () {
    const r1 = feed1.replicate()

    const feed2 = hypercore(function (filename) {
      return ram()
    }, feed1.key)

    const r2 = feed2.replicate()

    r1.pipe(r2).pipe(r1)

    feed2
      .createReadStream({ live: true })
      .on('data', function (data) {
        t.deepEqual(data.toString(), 'hello')
      })

    feed1.append('hello', function () {
      t.ok('2nd append')
    })
  })
})

test('demo core2', function (t) {
  t.plan(2)

  const feed1 = hypercore(function (filename) {
    return ram()
  })

  feed1.ready(function () {
    const ws = feed1.createWriteStream()

    ws.write('hello')

    const r1 = feed1.replicate()

    const feed2 = hypercore(function (filename) {
      return ram()
    }, feed1.key)

    const r2 = feed2.replicate()

    r1.pipe(r2).pipe(r1)

    feed2
      .createReadStream({ live: true })
      .on('data', function (data) {
        t.deepEqual(data.toString(), 'hello')
      })

    ws.write('hello')
  })
})

test('demo core3', function (t) {
  t.plan(2)

  const feed1 = hypercore(function (filename) {
    return ram()
  }, { valueEncoding: 'json' })

  feed1.ready(function () {
    const ws = feed1.createWriteStream()

    ws.write({ 'hello': 'world' })

    const r1 = feed1.replicate()

    const feed2 = hypercore(function (filename) {
      return ram()
    }, feed1.key, { valueEncoding: 'json' })

    const r2 = feed2.replicate()

    r1.pipe(r2).pipe(r1)

    feed2
      .createReadStream({ live: true })
      .on('data', function (data) {
        t.deepEqual(data, { hello: 'world' })
      })

    ws.write({ hello: 'world' })
  })
})

test('streams and replicate', function (t) {
  t.plan(5)

  const key = 'whaat'

  const ws = instance.createWriteStream(key)

  ws.write({ hello: 'world' })

  instance.getInfo(key, function (err, res) {
    t.error(err)
    t.ok(res.hypercore)
    t.ok(res.hypercore.key)

    const feed = hypercore(function (filename) {
      return ram()
    }, new Buffer(res.hypercore.key, 'hex'), {
      valueEncoding: 'json'
    })

    t.tearDown(feed.close.bind(feed, noop))

    feed.ready(function () {
      instance.replicate(key, feed)

      setImmediate(function () {
        ws.write({ hello: 'world' })
      })

      feed
        .createReadStream({ live: true })
        .on('data', function (data) {
          t.deepEqual(data, { hello: 'world' })
        })
    })
  })
})

test('createReadStream', function (t) {
  t.plan(2)

  const key = 'whaat2'

  const ws = instance.createWriteStream(key)

  ws.write({ hello: 'world' })
  ws.write({ hello: 'world' })

  const rs = instance.createReadStream(key, {
    live: true
  })

  rs.on('data', function (data) {
    t.deepEqual(data, { hello: 'world' })
  })
})

function noop () {}
