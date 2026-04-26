// Iterative radix-2 Cooley-Tukey FFT. In-place on real & imag arrays.
// N must be a power of 2.
export function fft(re, im, inverse = false) {
  const N = re.length
  if (N !== im.length) throw new Error('fft: re/im length mismatch')
  if ((N & (N - 1)) !== 0) throw new Error('fft: N must be a power of 2')

  // Bit-reverse permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }

  const sign = inverse ? 1 : -1
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1
    const phaseStep = (sign * 2 * Math.PI) / size
    for (let i = 0; i < N; i += size) {
      for (let k = 0; k < half; k++) {
        const phi = phaseStep * k
        const wr = Math.cos(phi)
        const wi = Math.sin(phi)
        const a = i + k
        const b = i + k + half
        const tr = wr * re[b] - wi * im[b]
        const ti = wr * im[b] + wi * re[b]
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N }
  }
}

export function nextPow2(n) {
  let p = 1
  while (p < n) p <<= 1
  return p
}

// Hann window
export function hann(n, i) {
  return 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
}

// Compute TDR from S11 array.
// Inputs:
//   s11Arr: array of { re, im } at uniformly-spaced (or close-to) frequencies
//   freqs:  Hz (must be uniformly spaced for simple IFFT — we assume so or resample)
//   vf:     velocity factor (0–1)
//   feet:   if true, distance in feet; else meters
// Returns { distances, rho } — distance vs reflection coefficient (linear)
export function computeTDR(s11Arr, freqs, vf = 0.66, feet = true) {
  const n = s11Arr.length
  if (n < 4) return { distances: [], rho: [] }
  const fMax = freqs[n - 1]
  const df = (fMax - freqs[0]) / (n - 1)

  // Build symmetric spectrum: H[0..n-1] = s11, H[N-i] = conj(s11[i])
  // Use N = next pow 2 of (2*n) so we have enough resolution and no wrap.
  const N = nextPow2(2 * n)
  const reArr = new Array(N).fill(0)
  const imArr = new Array(N).fill(0)
  // Apply Hann window across measurement band, place at indices 0..n-1
  for (let i = 0; i < n; i++) {
    const w = hann(n, i)
    reArr[i] = s11Arr[i].re * w
    imArr[i] = s11Arr[i].im * w
  }
  // Conjugate-symmetric mirror so IFFT yields real output
  for (let i = 1; i < n; i++) {
    reArr[N - i] = reArr[i]
    imArr[N - i] = -imArr[i]
  }
  // IFFT in-place
  fft(reArr, imArr, true)

  // Time axis: dt = 1 / (N * df). Distance one-way from round-trip: d = t * c * vf / 2
  const c = 299792458 // m/s
  const dt = 1 / (N * df)
  const halfN = N >> 1
  const distances = new Array(halfN)
  const rho = new Array(halfN)
  const factor = (c * vf) / 2 // m per second
  const conv = feet ? 3.28084 : 1
  for (let i = 0; i < halfN; i++) {
    distances[i] = i * dt * factor * conv
    rho[i] = reArr[i] // real part of impulse response = reflection coefficient
  }
  return { distances, rho }
}

// Find the largest reflection peak above a threshold within a distance range.
// minDistance excludes connector reflection at near-zero distance.
// maxDistance excludes the open/short termination at the cable end.
export function peakReflection(distances, rho, minDistance = 0.1, maxDistance = Infinity) {
  let bestIdx = -1
  let bestAbs = 0
  for (let i = 1; i < distances.length - 1; i++) {
    if (distances[i] < minDistance) continue
    if (distances[i] > maxDistance) break
    const a = Math.abs(rho[i])
    if (a > bestAbs && a > Math.abs(rho[i - 1]) && a > Math.abs(rho[i + 1])) {
      bestAbs = a
      bestIdx = i
    }
  }
  if (bestIdx === -1) return null
  return { index: bestIdx, distance: distances[bestIdx], rho: rho[bestIdx] }
}

// Find the rightmost (last) significant peak — robust end-of-cable detector that
// doesn't get fooled by a large in-cable defect that happens to be bigger than the end peak.
// Walks from the largest distance backward; returns the last local-maximum whose magnitude is
// at least `relThreshold * globalPeak`.
export function endPeakReflection(distances, rho, minDistance = 0.5, relThreshold = 0.3) {
  // Find the global peak amplitude in the search range first
  let globalPeak = 0
  for (let i = 0; i < distances.length; i++) {
    if (distances[i] < minDistance) continue
    const a = Math.abs(rho[i])
    if (a > globalPeak) globalPeak = a
  }
  if (globalPeak === 0) return null
  const cutoff = globalPeak * relThreshold
  // Walk from the end backwards, return the first peak above cutoff
  for (let i = distances.length - 2; i >= 1; i--) {
    if (distances[i] < minDistance) break
    const a = Math.abs(rho[i])
    if (a >= cutoff && a > Math.abs(rho[i - 1]) && a > Math.abs(rho[i + 1])) {
      return { index: i, distance: distances[i], rho: rho[i] }
    }
  }
  return null
}
