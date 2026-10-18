import { describe, expect, it } from 'vitest'
import { CliUsageError, parseCliArgs } from '../src/args.js'

const COMMANDS = ['verify', 'manifest', 'hash', 'verify-receipt', 'c2pa', 'verify-lineage'] as const

type Case = [string, string[], Record<string, string>]

function usageError(argv: string[]): CliUsageError {
  try {
    parseCliArgs(argv)
  } catch (err) {
    expect(err).toBeInstanceOf(CliUsageError)
    return err as CliUsageError
  }
  throw new Error(`expected a usage error for: ${argv.join(' ')}`)
}

describe('command selection', () => {
  it('returns help when no command is given', () => {
    expect(parseCliArgs([])).toEqual({ command: 'help', flags: {} })
  })

  it('returns help for an unknown command', () => {
    expect(parseCliArgs(['nope', '--bogus'])).toEqual({ command: 'help', flags: {} })
  })

  it.each(['constructor', 'toString', '__proto__'])('treats "%s" as an unknown command', (name) => {
    expect(parseCliArgs([name]).command).toBe('help')
  })

  it.each(COMMANDS)('recognises the %s command', (command) => {
    expect(parseCliArgs([command]).command).toBe(command)
  })
})

describe('documented short aliases', () => {
  const cases: Case[] = [
    ['verify', ['-m', 'm.json', '-o', 'json'], { manifest: 'm.json', output: 'json' }],
    ['manifest', ['-i', 'in.json', '-o', 'out.json'], { input: 'in.json', output: 'out.json' }],
    ['hash', ['-f', 'a.bin'], { file: 'a.bin' }],
    [
      'verify-receipt',
      ['-r', 'r.json', '-k', 'keys.json', '-o', 'json'],
      { receipt: 'r.json', keys: 'keys.json', output: 'json' },
    ],
    [
      'c2pa',
      ['-m', 'm.json', '-r', 'r.json', '-o', 'out.json'],
      { manifest: 'm.json', receipt: 'r.json', output: 'out.json' },
    ],
  ]

  it.each(cases)('%s accepts its aliases and stores them under the long name', (command, args, flags) => {
    expect(parseCliArgs([command, ...args])).toEqual({ command, flags })
  })
})

describe('--flag=value form', () => {
  const cases: Case[] = [
    ['verify', ['--output=json', '--manifest=m.json'], { output: 'json', manifest: 'm.json' }],
    ['manifest', ['--input=in.json', '--format=text'], { input: 'in.json', format: 'text' }],
    ['hash', ['--file=a.bin'], { file: 'a.bin' }],
    ['verify-receipt', ['--receipt=r.json', '--keys=k.json'], { receipt: 'r.json', keys: 'k.json' }],
    ['c2pa', ['--title=a=b', '--output=out.json'], { title: 'a=b', output: 'out.json' }],
  ]

  it.each(cases)('%s accepts --flag=value', (command, args, flags) => {
    expect(parseCliArgs([command, ...args])).toEqual({ command, flags })
  })

  it('accepts short aliases with an attached value', () => {
    expect(parseCliArgs(['hash', '-fa.bin']).flags).toEqual({ file: 'a.bin' })
  })
})

describe('long flags and camelCase fallbacks', () => {
  const cases: Case[] = [
    [
      'verify',
      ['--contract-id', 'C1', '--tx-hash', 'h', '--rpc-url', 'u', '--source-address', 'G1'],
      { 'contract-id': 'C1', 'tx-hash': 'h', 'rpc-url': 'u', 'source-address': 'G1' },
    ],
    [
      'verify',
      ['--contractId', 'C1', '--txHash', 'h', '--rpcUrl', 'u', '--sourceAddress', 'G1'],
      { contractId: 'C1', txHash: 'h', rpcUrl: 'u', sourceAddress: 'G1' },
    ],
    [
      'manifest',
      ['--video-hash', 'ab', '--network', 'n'],
      { 'video-hash': 'ab', network: 'n' },
    ],
    ['manifest', ['--videoHash', 'ab'], { videoHash: 'ab' }],
    ['verify-receipt', ['--proof-id', 'p1'], { 'proof-id': 'p1' }],
    ['verify-receipt', ['--proofId', 'p1'], { proofId: 'p1' }],
    [
      'verify-lineage',
      ['--output-digest', 'abc', '--contract-id', 'C1'],
      { 'output-digest': 'abc', 'contract-id': 'C1' },
    ],
    [
      'verify-lineage',
      ['--outputDigest', 'abc', '--contractId', 'C1'],
      { outputDigest: 'abc', contractId: 'C1' },
    ],
  ]

  it.each(cases)('%s keeps the long flag names handlers read', (command, args, flags) => {
    expect(parseCliArgs([command, ...args]).flags).toEqual(flags)
  })
})

describe('boolean flags', () => {
  it('parses --offline and --debug as the string "true"', () => {
    const { flags } = parseCliArgs(['verify', '--offline', '--debug'])
    expect(flags).toEqual({ offline: 'true', debug: 'true' })
  })

  it.each(COMMANDS)('%s accepts --debug', (command) => {
    expect(parseCliArgs([command, '--debug']).flags).toEqual({ debug: 'true' })
  })

  it('does not let a boolean flag swallow the next argument', () => {
    expect(usageError(['verify', '--offline', 'extra']).message).toContain('extra')
  })

  it('rejects a value attached to a boolean flag', () => {
    expect(usageError(['verify', '--offline=yes']).message).toContain('--offline')
  })

  it('rejects --offline on commands that do not support it', () => {
    expect(usageError(['hash', '--offline']).message).toContain('--offline')
  })
})

describe('stdin dash as a value', () => {
  it.each<Case>([
    ['verify', ['--manifest', '-'], { manifest: '-' }],
    ['manifest', ['-i', '-'], { input: '-' }],
    ['hash', ['-f', '-'], { file: '-' }],
    ['verify-receipt', ['--receipt', '-'], { receipt: '-' }],
    ['c2pa', ['-m', '-'], { manifest: '-' }],
  ])('%s accepts "-" for stdin', (command, args, flags) => {
    expect(parseCliArgs([command, ...args]).flags).toEqual(flags)
  })
})

describe('missing values', () => {
  it.each<[string, string[]]>([
    ['verify', ['--output']],
    ['verify', ['-o']],
    ['verify', ['--manifest']],
    ['manifest', ['--input']],
    ['manifest', ['-i']],
    ['hash', ['--file']],
    ['hash', ['-f']],
    ['verify-receipt', ['--keys']],
    ['verify-receipt', ['-k']],
    ['c2pa', ['--title']],
    ['verify', ['-o', '--offline']],
    ['hash', ['-f', '--debug']],
  ])('%s rejects %j', (command, args) => {
    const message = usageError([command, ...args]).message
    expect(message).toContain(`'${command}'`)
    expect(message).toContain('harpocrates help')
  })
})

describe('unknown flags', () => {
  it.each(COMMANDS)('%s rejects an unknown long flag', (command) => {
    expect(usageError([command, '--bogus']).message).toContain('--bogus')
  })

  it.each(COMMANDS)('%s rejects an unknown long flag with a value', (command) => {
    expect(usageError([command, '--bogus=1']).message).toContain('--bogus')
  })

  it.each(COMMANDS)('%s rejects an unknown short flag', (command) => {
    expect(usageError([command, '-z']).message).toContain('-z')
  })

  it.each(COMMANDS)('%s rejects a stray positional argument', (command) => {
    expect(usageError([command, 'stray']).message).toContain('stray')
  })

  it('rejects a flag that belongs to a different command', () => {
    expect(usageError(['hash', '--manifest', 'x']).message).toContain('--manifest')
    expect(usageError(['c2pa', '--input', 'x']).message).toContain('--input')
  })

  it('names the command and points at help in the message', () => {
    const message = usageError(['hash', '--bogus']).message
    expect(message).toContain("'hash'")
    expect(message).toContain('harpocrates help')
  })
})
