export function seedForBucket(bucket) {
	let value = BigInt(bucket)
	value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn
	value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn
	return Number((value ^ (value >> 31n)) & 0xffffffffn)
}

export function indexForBucket(bucket, length) {
	if (!Number.isSafeInteger(bucket) || bucket < 0)
		throw new RangeError('bucket must be a non-negative safe integer')
	if (!Number.isInteger(length) || length < 1)
		throw new RangeError('length must be a positive integer')
	const seed = seedForBucket(bucket)
	let value = seed | 0
	value = (value + 0x6d2b79f5) | 0
	let t = value
	t = Math.imul(t ^ (t >>> 15), t | 1)
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
	const random = ((t ^ (t >>> 14)) >>> 0) / 4294967296
	return Math.floor(random * length)
}
