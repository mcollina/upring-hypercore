'use strict'

const test = require('tap').test
const hypercore = require('hypercore')
const ram = require('random-access-memory')

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
