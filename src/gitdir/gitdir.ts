import fs from 'fs'
import { isBoolean } from 'node:util'
import path from 'path'

export enum PreParserResult {
    COMMENT,
    BLANK,
    PATTERN
}

const slash = "\\"

// PE - PathElement
export enum MatchTokenTypes {
    ZeroOrMorePE,
    SinglePE
}

export type MatchZeroOrMorePEs = {
  tokenType: MatchTokenTypes.ZeroOrMorePE

}
export type MatchSinglePE = {
  tokenType: MatchTokenTypes.SinglePE
  pattern: string
}

export type MatchTokens =
  | MatchZeroOrMorePEs
  | MatchSinglePE


export interface MatchEntry {
    originalPattern: string
    parsedPattern: string
    entryType: PreParserResult
    isNegation: boolean
    isDirectoryMatch: boolean
    isFullMatch: boolean
    tokens: MatchTokens[]
}

export function isMatchZeroOrMorePEsToken(
  token: MatchTokens
): token is MatchZeroOrMorePEs {
  return token && token.tokenType === MatchTokenTypes.ZeroOrMorePE
}

export function isMatchSinglePEToken(
  token: MatchTokens
): token is MatchSinglePE {
  return token && token.tokenType === MatchTokenTypes.SinglePE
}

/*
The preparser takes the input gitignore-like pattern and converts it into a form more
suitable for processing. For details on gitignore see the documentation online.

All basics are taking care of - identify comments and blank lines, escaping characters, removing whitespace, 
handling negation (!), full match and directory match options.
*/

export function preparser(instr: string): MatchEntry {
    // lines starting with # - comment
    const entry: MatchEntry = {
        originalPattern: instr,
        parsedPattern: instr,
        entryType: PreParserResult.PATTERN,
        isNegation: false,
        isDirectoryMatch: false,
        isFullMatch: false,
        tokens: []
    }

    if (/^\s*$/.test(entry.parsedPattern)) {
      entry.entryType = PreParserResult.BLANK;
      return entry;
    }

    if (entry.parsedPattern.startsWith("#")) {
      entry.entryType = PreParserResult.COMMENT;
      return entry;
    }

    entry.entryType = PreParserResult.PATTERN

    if (entry.parsedPattern.startsWith(`!`)) {
      entry.parsedPattern = entry.parsedPattern.slice(1);
      entry.isNegation = true;
    } else if (entry.parsedPattern.startsWith(`${slash}#`)) {
      entry.parsedPattern = entry.parsedPattern.slice(1);
    }

    // whitespace at the end is trimmed
    const end_ws_match = /^(.*?)(\\(\s)\s*|\s+)$/
    const ws_match = end_ws_match.exec(entry.parsedPattern)
    if (ws_match) {
        //ws_match[1] is the non whitespaced string
        //ws_match[3] is the (possibly) escaped whitespace
        entry.parsedPattern = `${ws_match[1]}${ws_match[3]? ws_match[3]: ''}`;
    }

    if (entry.parsedPattern.endsWith('/')) {
        entry.parsedPattern = entry.parsedPattern.slice(0,-1)
        entry.isDirectoryMatch = true
    } 

    if (entry.parsedPattern.includes('/')) {
      entry.isFullMatch = true;
    }

    if (entry.parsedPattern.startsWith('/')) {
        entry.parsedPattern = entry.parsedPattern.slice(1)
    }

    return entry
}

export function tokenizeEntry(instr: string) : MatchEntry {
    const entry = preparser(instr)
    if (entry.entryType === PreParserResult.PATTERN) {
        const tokens = entry.parsedPattern.split("/")
        const lastIndex = tokens.length - 1
        entry.tokens = tokens.map((pattern, index) => {
            if (pattern === "**") {
                return { 
                    tokenType: MatchTokenTypes.ZeroOrMorePE
                }
            } else {
                return {tokenType: MatchTokenTypes.SinglePE, pattern}
            }
        })
    }

    return entry
}

// Iterative algorithm from : http://dogankurt.com/wildcard.html
export function fnmatch_noseq(pat: string, str: string)
{
  let lens = str.length
  let lenp = pat.length
  let curp = 0
  let curs = 0

  /* -1 indicates no saved location for backtracking */
  let locp = -1
  let locs = -1

  while (curs < lens) {
    /* we encounter a star */
    if (pat[curp] === '*') {
      curp++
      if (curp === lenp) {
        return true
      }
      locp = curp
      locs = curs
      continue
    }
    /* we have end of pattern or mismatch - backtrack or exit */
    if (curp === lenp || (str[curs] != pat[curp] && pat[curp] != '?')) {
      if (locp == -1) {
        return false
      }
      locs++
      curs = locs
      curp = locp
      continue
    }
    curp++
    curs++
  }

  /* check if the pattern's ended */
  while (pat[curp] === '*') {
    curp++
  }

  return curp === lenp
}

// matches pattern against a path broken up into an array
// based on fnmatch algo above, with adjustments for paths
// ignores negation
export function path_matcher(entry: MatchEntry, src: string[], isFile: boolean = false): boolean {
  //console.log(`path_matcher ${entry.originalPattern} ${src} ${isFile}`)
  // handle the non-full match case (always a single directory or filename)
  let pat = entry.tokens
  let lens = isFile && entry.isDirectoryMatch ? src.length - 1 : src.length
  let lenp = pat.length
  let curp = 0
  let curs = 0

  if (!entry.isFullMatch) {
    // a non-full match can match any part of the path
    for (var i = 0; i < lens; i++) {
        if (fnmatch_noseq(entry.parsedPattern, src[i])) {
        return true
        }
    }
    return false
  }

  /* -1 indicates no saved location for backtracking */
  let locp = -1
  let locs = -1

  while (curs < lens) {
    // if directory match, early end of pattern means success
    if (curp === lenp && entry.isDirectoryMatch) {
      return true
    }

    /* we encounter a globstar */
    if (isMatchZeroOrMorePEsToken(pat[curp])) {
      curp++
      if (curp === lenp) {
        return true
      }
      locp = curp
      locs = curs
      continue
    }

    /* we have end of pattern or mismatch - backtrack or exit */
    if (
      curp === lenp ||
      !fnmatch_noseq((pat[curp] as MatchSinglePE).pattern, src[curs])
    ) {
      if (locp === -1) {
        return false
      }
      locs++
      curs = locs
      curp = locp
      continue
    }

    // next token
    curp++
    curs++
  }

// Git pattern matching : abc/ matches abc, but abc/** does not match abc, but only files under abc, such as abc/x
// So, unlike fnmatch, we should not skip remaining globstar patterns 

  return curp === lenp 
}

export function parsePatternList(patternStr: string): MatchEntry[] {
    return patternStr.split('\n').map((p) => tokenizeEntry(p))
}

export function matchPatternList(entries: MatchEntry[], pathToMatch: string, isFile: boolean, isMatched: boolean = false) {

    let pathElements = pathToMatch.split('/')
    let matched = isMatched

    for (const entry of entries) {
      if (entry.entryType === PreParserResult.BLANK || entry.entryType === PreParserResult.COMMENT) {
          continue
      }

      // a directory match cannot be negated - so we need to always run even if already matched
      // and exit immediately
      if (entry.isDirectoryMatch && !entry.isNegation) {
        if (path_matcher(entry, pathElements, isFile)) {
            return true
        }
      } 
      // a negation is only run if matched, and on success results in reversing the match
      else if (matched && entry.isNegation) {
        if (path_matcher(entry, pathElements, isFile)) {
          matched = false
        }
      }
      // all other patterns run only if not matched
      else if (!matched && !entry.isNegation) {
        matched = path_matcher(entry, pathElements, isFile)
      }
    }

    return matched
}

export class GitPatternList {
  private entries: MatchEntry[]

  constructor(patternArray: string[]) {
      this.entries = patternArray.map((e) => tokenizeEntry(e))
  }

  matches(str: string) {
    return matchPatternList(this.entries, str, false)
  }
}

export class GitDir {
  private fullPath: string
  private dirpath: string
  entries?: MatchEntry[]
  parent?: GitDir

  private constructor(dirpath: string, entries: MatchEntry[], parent?: GitDir) {
    this.fullPath = parent? path.join(parent.FullPath(), dirpath) : dirpath
    this.dirpath = parent? dirpath : ''
    this.parent = parent
    this.entries = entries
  }

  FullPath() {
      return this.fullPath
  }

  // If no parent, dirpath must be a path to directory
  // else dirpath should be relative to parent
  static async New(dirpath: string, parent?: GitDir) {
    const newGitDir = new GitDir(dirpath, [], parent)
    let gitignore = ''
    try {
      const gitignore = await fs.promises.readFile(
        path.join(newGitDir.FullPath(), '.gitignore')
      )
    } catch (e) {
      // no gitignore found. TODO : Check for NOENT or something
      if (parent) {
        return parent
      }
    }

    newGitDir.entries = gitignore
      .toString()
      .split('\n')
      .map((e) => tokenizeEntry(e))

    return newGitDir
  }

  matches(pathToMatch: string, isFile: boolean): boolean {
    let isMatched = false
    if (this.parent) {
      isMatched = this.parent.matches(path.join(this.dirpath, pathToMatch), isFile)
    }

    if (this.entries) {
         return matchPatternList(
            this.entries,
            pathToMatch,
            isFile,
            isMatched
        )
    }

    return isMatched
  }

  async *walk(relPath: string = ''): AsyncIterableIterator<string> {
    //console.log(`walk ${relPath} in ${this.FullPath()}`)
    if (relPath !== '') {
        const gitDir = await GitDir.New(relPath, this)
        if (gitDir !== this) {
            yield *gitDir.walk()
            return 
        }
    }

    for await (const direntry of await fs.promises.opendir(path.join(this.FullPath(), relPath))) {
      const childPath = path.join(relPath, direntry.name)
      if (!this.matches(childPath, direntry.isFile())) {
        if (direntry.isDirectory()) {
            yield* this.walk(childPath)
        } else {
           yield path.join(this.dirpath, childPath)
        }
      }
    }
  }
}
