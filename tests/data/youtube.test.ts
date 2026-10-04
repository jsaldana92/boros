import { test } from 'node:test'
import assert from 'node:assert/strict'
import { youtubeEmbedUrl } from '../../src/lib/youtube.ts'

test('supported saved YouTube URLs yield only the validated ID and fixed player options', () => {
  for (const url of ['https://youtu.be/Abcdef_12-3', 'https://youtube.com/watch?v=Abcdef_12-3', 'https://www.youtube.com/shorts/Abcdef_12-3', 'https://m.youtube.com/live/Abcdef_12-3', 'https://www.youtube.com/embed/Abcdef_12-3']) {
    assert.equal(youtubeEmbedUrl(url + (url.includes('?') ? '&' : '?') + 'autoplay=1&note=private&origin=https://evil.test#anything'), 'https://www.youtube.com/embed/Abcdef_12-3?autoplay=0&controls=1&playsinline=1&fs=1')
  }
})
test('unsupported and malformed saved links never create an iframe URL', () => {
  for (const url of [undefined, '', 'http://youtu.be/Abcdef_12-3', 'https://youtube.com.evil.test/watch?v=Abcdef_12-3', 'https://youtube.com@evil.test/watch?v=Abcdef_12-3', 'https://user:pass@youtube.com/watch?v=Abcdef_12-3', 'https://youtube.com:8080/watch?v=Abcdef_12-3', 'https://youtube.com/watch?v=Abcdef_12-3&v=abcdefghijk', 'https://youtu.be/short', 'https://youtube.com/playlist?list=Abcdef_12-3', '<iframe src="https://youtube.com"></iframe>', 'javascript:alert(1)', 'https://youtube.com/embed/Abcdef_12-3/extra']) assert.equal(youtubeEmbedUrl(url), undefined, url)
})
