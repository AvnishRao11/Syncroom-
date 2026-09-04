import test from 'node:test';
import assert from 'node:assert/strict';
import { videoIdFromUrl } from '../src/services/room.service.js';

const videoId = 'dQw4w9WgXcQ';

test('extracts IDs from supported YouTube URL formats', () => {
    assert.equal(videoIdFromUrl(`https://www.youtube.com/watch?v=${videoId}`), videoId);
    assert.equal(videoIdFromUrl(`https://youtu.be/${videoId}`), videoId);
    assert.equal(videoIdFromUrl(`https://www.youtube.com/shorts/${videoId}`), videoId);
    assert.equal(videoIdFromUrl(`https://www.youtube.com/embed/${videoId}`), videoId);
    assert.equal(videoIdFromUrl(videoId), videoId);
});

test('rejects malformed IDs and lookalike domains', () => {
    assert.equal(videoIdFromUrl('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'), null);
    assert.equal(videoIdFromUrl('https://www.youtube.com/watch?v=too-short'), null);
    assert.equal(videoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ!'), null);
    assert.equal(videoIdFromUrl('not a url'), null);
    assert.equal(videoIdFromUrl(null), null);
});