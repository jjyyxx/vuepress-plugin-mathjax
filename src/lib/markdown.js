// based on https://github.com/waylonflinn/markdown-it-katex

function isCloseable(state, pos) {
  const prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1
  const nextChar = pos + 1 <= state.posMax ? state.src.charCodeAt(pos + 1) : -1

  return (
    prevChar !== 0x20 /* " " */ &&
    prevChar !== 0x09 /* "\t" */ &&
    (
      nextChar < 0x30 /* "0" */ ||
      nextChar > 0x39 /* "9" */
    )
  )
}

function isOpenable(state, pos) {
  const nextChar = pos + 1 <= state.posMax ? state.src.charCodeAt(pos + 1) : -1

  return (
    nextChar !== 0x20 /* " " */ &&
    nextChar !== 0x09 /* "\t" */
  )
}

function math_inline(state, silent) {
  let match, token, pos

  if (state.src[state.pos] !== '$') {
    return false
  }

  if (!isOpenable(state, state.pos)) {
    if (!silent) state.pending += '$'
    state.pos += 1
    return true
  }

  // First check for and bypass all properly escaped delimieters
  // This loop will assume that the first leading backtick can not
  // be the first character in state.src, which is known since
  // we have found an opening delimieter already.
  const start = state.pos + 1
  match = start
  while ((match = state.src.indexOf('$', match)) !== -1) {
    // Found potential $, look for escapes, pos will point to
    // first non escape when complete
    pos = match - 1
    while (state.src[pos] === '\\') pos -= 1

    // Even number of escapes, potential closing delimiter found
    if ((match - pos) % 2 === 1) break
    match += 1
  }

  // No closing delimter found.  Consume $ and continue.
  if (match === -1) {
    if (!silent) state.pending += '$'
    state.pos = start
    return true
  }

  // Check if we have empty content, ie: $$.  Do not parse.
  if (match - start === 0) {
    if (!silent) state.pending += '$$'
    state.pos = start + 1
    return true
  }

  // Check for valid closing delimiter
  if (!isCloseable(state, match)) {
    if (!silent) state.pending += '$'
    state.pos = start
    return true
  }

  if (!silent) {
    token = state.push('math_inline', 'math', 0)
    token.markup = '$'
    token.content = state.src.slice(start, match)
  }

  state.pos = match + 1
  return true
}

function math_block (state, start, end, silent) {
  let firstLine, lastLine, next, lastPos, found = false,
      pos = state.bMarks[start] + state.tShift[start],
      max = state.eMarks[start]

  if (pos + 2 > max) return false
  if (state.src.slice(pos, pos + 2) !== '$$') return false

  pos += 2
  firstLine = state.src.slice(pos,max)

  if (silent) return true
  if (firstLine.trim().slice(-2) === '$$') {
    // Single line expression
    firstLine = firstLine.trim().slice(0, -2)
    found = true
  }

  for (next = start; !found; ) {

    next++

    if (next >= end) break

    pos = state.bMarks[next] + state.tShift[next]
    max = state.eMarks[next]

    if (pos < max && state.tShift[next] < state.blkIndent){
      // non-empty line with negative indent should stop the list:
      break
    }

    if (state.src.slice(pos, max).trim().slice(-2) === '$$') {
      lastPos = state.src.slice(0, max).lastIndexOf('$$')
      lastLine = state.src.slice(pos, lastPos)
      found = true
    }
  }

  state.line = next + 1

  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '')
    + state.getLines(start + 1, next, state.tShift[start], true)
    + (lastLine && lastLine.trim() ? lastLine : '')
  token.map = [ start, state.line ]
  token.markup = '$$'
  return true
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

module.exports = (md, options) => {
  const { render, config } = options

  md.inline.ruler.after('escape', 'math_inline', math_inline)
  md.block.ruler.after('blockquote', 'math_block', math_block, {
    alt: [ 'paragraph', 'reference', 'blockquote', 'list' ]
  })

  function getMathRenderer (display, wrapper) {
    return (tokens, index, options, env) => {
      const { content } = tokens[index]
      try {
        const { mathjax = {} } = env.frontmatter || {}
        return wrapper(render(content, display, mathjax.presets))
      } catch (error) {
        if (config.showError && env.loader) {
          env.loader.emitError(error)
        }
        return wrapper(escapeHtml(content))
      }
    }
  }

  md.renderer.rules.math_inline = getMathRenderer(false, content => content)
  md.renderer.rules.math_block = getMathRenderer(true, content => `<p>${content}</p>`)
}
