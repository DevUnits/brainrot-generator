import { indexForBucket, seedForBucket } from './generator-core.js'

const PERSONAS = [
	{ p: 0.4, r: 0.75 },
	{ p: 1.9, r: 1.3 },
	{ p: 1.1, r: 1.6 },
	{ p: 0.9, r: 0.65 },
	{ p: 0.2, r: 1.0 },
	{ p: 1.0, r: 1.0 }
]

let PAIRS = []
let audioCtx = null,
	ruVoice = null,
	audioReady = false
let muted = localStorage.getItem('generator-muted') === 'true'
let lastAbsolute = -1,
	currentPair = null,
	currentSeed = 0,
	frameId = 0
let speakToken = 0,
	lastDisplay = ''
const phraseEl = document.getElementById('phrase')
const wordEl = document.getElementById('word')
const nextWordEl = document.getElementById('nextWord')
const timerEl = document.getElementById('timer')
const statusEl = document.getElementById('status')
const statusText = document.getElementById('statusText')
const soundToggle = document.getElementById('soundToggle')

document.body.classList.toggle('muted', muted)
updateSoundButton()

function mulberry32(a) {
	return function () {
		a |= 0
		a = (a + 0x6d2b79f5) | 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function pickPair(bucket) {
	const seed = seedForBucket(bucket)
	return { pair: PAIRS[indexForBucket(bucket, PAIRS.length)], seed }
}

function makeMelody(word, seed) {
	const r = mulberry32(seed ^ 0x9e3779b9),
		scale = [0, 2, 4, 7, 9]
	const base = 220 * Math.pow(2, (Math.floor(r() * 3) - 1) / 12)
	const notes = []
	let t = 0
	for (
		let i = 0, count = Math.max(1, Math.ceil(word.length / 2));
		i < count;
		i++, t += 0.15
	) {
		notes.push({
			f: base * Math.pow(2, scale[Math.floor(r() * scale.length)] / 12),
			d: 0.12 + r() * 0.1,
			t
		})
	}
	return notes
}

function initAudio() {
	try {
		audioCtx = new (window.AudioContext || window.webkitAudioContext)()
		if (audioCtx.state === 'suspended') audioCtx.resume()
		return true
	} catch (e) {
		return false
	}
}

function loadVoices() {
	if (!('speechSynthesis' in window)) return
	const voices = speechSynthesis.getVoices()
	if (voices.length)
		ruVoice =
			voices.find(v => v.lang.startsWith('ru') && v.localService) ||
			voices.find(v => v.lang.startsWith('ru')) ||
			null
}

if ('speechSynthesis' in window) {
	speechSynthesis.onvoiceschanged = loadVoices
	loadVoices()
}

function playChime(seed) {
	if (!audioCtx) return
	const o = audioCtx.createOscillator(),
		g = audioCtx.createGain(),
		t = audioCtx.currentTime
	o.type = 'sine'
	o.frequency.value = 880 + mulberry32(seed ^ 0x7f4a7c15)() * 400
	g.gain.setValueAtTime(0, t)
	g.gain.linearRampToValueAtTime(0.07, t + 0.02)
	g.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
	o.connect(g)
	g.connect(audioCtx.destination)
	o.start(t)
	o.stop(t + 0.3)
}

function playDrop(seed) {
	if (!audioCtx) return
	const o = audioCtx.createOscillator(),
		g = audioCtx.createGain(),
		t = audioCtx.currentTime + 0.05
	const f = 60 + mulberry32(seed ^ 0x3c6ef372)() * 40
	o.type = 'sine'
	o.frequency.setValueAtTime(f * 2, t)
	o.frequency.exponentialRampToValueAtTime(f, t + 0.3)
	g.gain.setValueAtTime(0.18, t)
	g.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
	o.connect(g)
	g.connect(audioCtx.destination)
	o.start(t)
	o.stop(t + 0.5)
}

function playMelody(notes) {
	if (!audioCtx) return
	const start = audioCtx.currentTime + 0.15
	for (const n of notes) {
		const o = audioCtx.createOscillator(),
			g = audioCtx.createGain(),
			t = start + n.t,
			end = t + n.d
		o.type = 'triangle'
		o.frequency.value = n.f
		g.gain.setValueAtTime(0, t)
		g.gain.linearRampToValueAtTime(0.11, t + 0.01)
		g.gain.exponentialRampToValueAtTime(0.001, end)
		o.connect(g)
		g.connect(audioCtx.destination)
		o.start(t)
		o.stop(end)
	}
}

function speak(text, seed) {
	if (!('speechSynthesis' in window)) return
	const persona =
			PERSONAS[Math.floor(mulberry32(seed ^ 0xb5297a4d)() * PERSONAS.length)],
		token = ++speakToken
	speechSynthesis.cancel()
	setTimeout(() => {
		if (token !== speakToken) return
		const utterance = new SpeechSynthesisUtterance(text)
		utterance.lang = 'ru-RU'
		utterance.pitch = persona.p
		utterance.rate = persona.r
		utterance.volume = 1
		if (ruVoice) utterance.voice = ruVoice
		speechSynthesis.speak(utterance)
	}, 400)
}

function setStatus(type, text) {
	statusEl.className = 'status' + (type ? ' ' + type : '')
	statusText.textContent = text
}

function updateSoundButton() {
	soundToggle.setAttribute('aria-pressed', String(muted))
	soundToggle.setAttribute(
		'aria-label',
		muted ? 'Включить звук' : 'Выключить звук'
	)
}

soundToggle.addEventListener('click', () => {
	muted = !muted
	localStorage.setItem('generator-muted', String(muted))
	document.body.classList.toggle('muted', muted)
	updateSoundButton()
	if (muted) {
		if ('speechSynthesis' in window) speechSynthesis.cancel()
		if (audioCtx) audioCtx.suspend()
	} else {
		startAudio()
		if (audioCtx) audioCtx.resume()
	}
})

function playCurrent() {
	if (!audioReady || muted || !currentPair) return
	const sound = currentPair.sound || currentPair.word
	playChime(currentSeed)
	playDrop(currentSeed)
	playMelody(makeMelody(sound, currentSeed))
	speak(sound, currentSeed)
}

function trigger(bucket) {
	const result = pickPair(bucket)
	currentPair = result.pair
	currentSeed = result.seed
	wordEl.textContent = currentPair.word
	nextWordEl.textContent = pickPair(bucket + 1).pair.word
	phraseEl.classList.remove('enter')
	void phraseEl.offsetWidth
	phraseEl.classList.add('enter')
	playCurrent()
}

function loop() {
	const now = Date.now()
	const bucket = Math.floor(now / 10000)
	const remaining = 10 - (now % 10000) / 1000
	const value = remaining.toFixed(1)
	if (value !== lastDisplay) {
		lastDisplay = value
		timerEl.textContent = value
	}
	if (bucket !== lastAbsolute) {
		lastAbsolute = bucket
		trigger(bucket)
	}
	frameId = requestAnimationFrame(loop)
}

function startLoop() {
	if (document.hidden) return
	loop()
}

document.addEventListener('visibilitychange', () => {
	if (document.hidden) cancelAnimationFrame(frameId)
	else {
		frameId = requestAnimationFrame(startLoop)
		lastAbsolute = -1
	}
})

function startAudio() {
	if (audioReady) return
	if (!(window.AudioContext || window.webkitAudioContext) || !initAudio()) {
		setStatus('err', 'ОШИБКА')
		return
	}
	audioReady = true
	setStatus('ok', 'РАБОТАЕТ')
	if ('speechSynthesis' in window)
		speechSynthesis.speak(new SpeechSynthesisUtterance(''))
	if (((Date.now() % 60000) / 1000) % 10 < 8) playCurrent()
}

async function loadWords() {
	try {
		const response = await fetch('words.json')
		if (!response.ok) throw new Error('words.json: ' + response.status)
		const words = await response.json()
		if (
			!Array.isArray(words) ||
			words.length === 0 ||
			words.some(
				item =>
					!item ||
					typeof item.word !== 'string' ||
					!item.word.trim() ||
					(item.sound !== undefined && typeof item.sound !== 'string')
			)
		) {
			throw new Error('Некорректный список слов')
		}
		PAIRS = words
		setStatus('', 'НАЖМИ')
		startLoop()
	} catch (error) {
		console.error('Не удалось загрузить слова:', error)
		setStatus('err', 'ОШИБКА СЛОВАРЯ')
	}
}

document.addEventListener('click', startAudio, { once: true })
document.addEventListener('touchstart', startAudio, { once: true })
document.addEventListener('keydown', startAudio, { once: true })
loadWords()
