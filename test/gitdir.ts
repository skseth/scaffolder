import { expect } from "chai"
import { preparser, MatchEntry, PreParserResult, tokenizeEntry, MatchTokenTypes, fnmatch_noseq, path_matcher, parsePatternList, matchPatternList } from "../src/gitdir/gitdir";

/*
# - comment
blank line - skip
Single pattern (escaping / global modifiers)

starts with \! - remove the \
ends with spaces - trim, unless immediate preceding character is \, in which case remove the \
starts with ! - negation pattern, remove the !, else normal pattern
/ at end - directory pattern, remove the /, else universal pattern
/ anywhere else - match full pathname, else match base name only
/** at the end - MatchAnyDirectoryOrFileInside convert to /**(slash)*
*/

// Unfortunately slashes are escape characters in javascript.
const slash = '\\'

describe("preparser normalizes input", function() {
  const checkPreparserPattern = (
    pp: MatchEntry,
    input: string,
    expParsedPattern: string,
    expCommentType?: PreParserResult
  ) => {
    expect(pp.originalPattern).to.equal(input);
    expect(pp.parsedPattern).to.equal(expParsedPattern);
    if (expCommentType) {
      expect(pp.entryType).to.equal(expCommentType);
    }
  };

  it("whitespace only lines are blank", function () {
    const input = "  \t \n";
    const pp = preparser(input);
    checkPreparserPattern(pp, input, input, PreParserResult.BLANK);
  });

  it("comments start with #", function () {
    const input = "#abc";
    const pp = preparser(input);
    checkPreparserPattern(pp, input, input, PreParserResult.COMMENT);
  });

  // starts with \# - remove the \
  it("escapes initial hash", function () {
    const input = `${slash}#abc`;
    const pp = preparser(input);
    checkPreparserPattern(pp, input, "#abc");
    expect(pp.entryType).to.not.equal(PreParserResult.COMMENT);
  });

  // starts with \# - remove the \
  it("negation starts with !", function () {
    const input = "!abc";
    const pp = preparser(input);
    checkPreparserPattern(pp, input, "abc", PreParserResult.PATTERN);
    expect(pp.isNegation).to.equal(true);
  });

  it("initial ! followed by ${slash}# retains slash", function () {
    const input = `!${slash}#abc`;
    const pp = preparser(input);
    checkPreparserPattern(pp, input, `${slash}#abc`);
  });

  it("initial ! followed by ${slash}# retains slash", function () {
    const input = `!${slash}#abc`;
    const pp = preparser(input);
    checkPreparserPattern(pp, input, `${slash}#abc`);
  });

  it("removes trailing whitespace", function () {
    const input = "abc  \t";
    const pp = preparser(input);
    checkPreparserPattern(pp, input, "abc");
  });

  it("retains escaped trailing whitespace", function () {
    const input = `abc ${slash}\t `;
    const pp = preparser(input);
    checkPreparserPattern(pp, input, `abc \t`);
  });

  it("trailing / indicates directory match", function () {
    const input = `abc/`;
    const pp = preparser(input);
    checkPreparserPattern(pp, input, `abc`);
    expect(pp.isDirectoryMatch).to.equal(true);
  });

    it("non-trailing / indicates full match", function () {
        const input = `/abc/bcd`;
        const pp = preparser(input);
        checkPreparserPattern(pp, input, `abc/bcd`);
        expect(pp.isFullMatch).to.equal(true);
    });

    it("mixing non-trailing and trailing / indicates full match & directory match", function () {
      const input = `abc/bcd/`;
      const pp = preparser(input);
      checkPreparserPattern(pp, input, `abc/bcd`);
      expect(pp.isFullMatch).to.equal(true);
      expect(pp.isDirectoryMatch).to.equal(true);
    });

});


describe('tokenizer generates tokens for entry', function() {
  context('patterns', function() {
     [
       {
         patternName: 'no / => one DirectoryOrFile token',
         input: 'abc.go',
         tokenTypes: [MatchTokenTypes.SinglePE],
         patterns: ['abc.go'],
         isFullMatch: false,
         isDirectoryMatch: false,
         isNegation: false
       },
       {
         patternName: 'ending / only => one SingleDirectory token',
         input: 'abc.go/',
         tokenTypes: [
           MatchTokenTypes.SinglePE
         ],
         patterns: ['abc.go'],
         isFullMatch: false,
         isDirectoryMatch: true,
         isNegation: false
       },
       {
         patternName:
           '/ at beginning only => DirectoryOrFile token with full path match',
         input: '/abc.go',
         tokenTypes: [MatchTokenTypes.SinglePE],
         patterns: ['abc.go'],
         isFullMatch: true,
         isDirectoryMatch: false,
         isNegation: false
       },
       {
         patternName: 'multiple slashes => full match',
         input: 'abc/def/ced',
         tokenTypes: [
           MatchTokenTypes.SinglePE,
           MatchTokenTypes.SinglePE,
           MatchTokenTypes.SinglePE
         ],
         patterns: ['abc', 'def', 'ced'],
         isFullMatch: true,
         isDirectoryMatch: false,
         isNegation: false
       },
       {
         patternName: 'globstar pattern',
         input: 'abc/**/ced',
         tokenTypes: [
           MatchTokenTypes.SinglePE,
           MatchTokenTypes.ZeroOrMorePE,
           MatchTokenTypes.SinglePE
         ],
         patterns: ['abc', , 'ced'],
         isFullMatch: true,
         isDirectoryMatch: false,
         isNegation: false
       },
       {
         patternName: 'globstar at end pattern',
         input: 'abc/**',
         tokenTypes: [
           MatchTokenTypes.SinglePE,
           MatchTokenTypes.ZeroOrMorePE
         ],
         patterns: ['abc', ],
         isFullMatch: true,
         isDirectoryMatch: false,
         isNegation: false
       }
     ].forEach(function (e) {
       it(`${e.patternName}`, (done) => {
         const te = tokenizeEntry(e.input)
         expect(te.tokens.length).to.equal(
           e.tokenTypes.length,
           'Tokens length does not match'
         )
         expect(te.isDirectoryMatch).to.equal(e.isDirectoryMatch)
         expect(te.isFullMatch).to.equal(e.isFullMatch)
         expect(te.isNegation).to.equal(e.isNegation)
         te.tokens.forEach((t, index) => {
           expect(t.tokenType).to.equal(e.tokenTypes[index])
           if (e.patterns[index] !== 'undefined') {
             expect((t as any).pattern).to.equal(e.patterns[index])
           }
         })
         done()
       })
     })
    })
});

describe('directory_matcher', function () {
  context('match/notmatch', function () {
    ;;[
      {
        p: 'abc/def/',
        m: ['abc/def', 'abc/def/ced', 'abc/de'],
        dir: [true, true, false],
        file: [false, true, false]
      },
      {
        p: 'abc/**/def/',
        m: ['abc/xyz/def', 'abc/def', 'abc/def/xyz', 'abc/de'],
        dir: [true, true, true, false],
        file: [false, false, true, false]
      },
      {
        p: 'abc/def/**',
        m: ['abc/def/xyz', 'abc/def/xyz/lmn', 'abc/def'],
        dir: [true, true, false],
        file: [true, true, false]
      },
      {
        p: 'abc/',
        m: ['abc', 'xyz/abc', 'xyz/abc/def', 'xyz/lmn'],
        dir: [true, true, true, false],
        file: [false, false, true, false]
      },
      {
        p: 'abc',
        m: ['abc', 'xyz/abc', 'xyz/abc/def', 'xyz/lmn'],
        dir: [true, true, true, false],
        file: [true, true, true, false]
      }
    ].forEach(function (e) {
      it(`${e.p}`, (done) => {
        const entry = tokenizeEntry(e.p)
        console.log(`entry ${JSON.stringify(entry, null, 2)}`)
        e.m.forEach((m, index) => {
          const src = m.split('/')
          expect(path_matcher(entry, src)).to.equal(e.dir[index], m)
          expect(path_matcher(entry, src, true)).to.equal(
            e.file[index],
            `${m} as file`
          )
        })
        done()
      })
    })
  })
})


describe('fnmatch - no sequence', function () {
  context('match/notmatch', function () {
    ;;[
      {
        p: 'abc*.go',
        m: ['abc.go', 'abcd.go', 'abcdef.go'],
        n: ['ab.go', 'abcgo', 'abc.gox']
      },
      {
        p: 'abc.go*',
        m: ['abc.go', 'abc.gox', 'abc.goxxx'],
        n: ['ab.go', 'abcgo']
      }
    ].forEach(function (e) {
      it(`${e.p}`, (done) => {
        e.m.forEach((m) => {
          expect(fnmatch_noseq(e.p, m)).to.equal(true, m)
        })
        e.n.forEach((n) => {
          expect(fnmatch_noseq(e.p, n)).to.equal(false, n)
        })
        done()
      })
    })
  })
})

describe('matcher', function () {
  context('match/notmatch', function () {
    [
      {
        p: ['abc/def/'],
        m: ['abc/def', 'abc/def/ced', 'abc/de'],
        dir: [true, true, false],
        file: [false, true, false]
      },
      // negation has no effect on directory match
      {
        p: ['abc/def/', '!ced'],
        m: ['abc/def', 'abc/def/ced', 'abc/de'],
        dir: [true, true, false],
        file: [false, true, false]
      },
    ].forEach(function (e) {
      it(`${e.p}`, (done) => {
        const entries = parsePatternList(e.p.join('\n'))
        console.log(JSON.stringify(entries, null, 2))
        e.m.forEach((m, index) => {
          expect(matchPatternList(entries, m, false)).to.equal(e.dir[index], m)
          expect(matchPatternList(entries, m, true)).to.equal(
            e.file[index],
            `${m} as file`
          )
        })
        done()
      })
    })
  })
})


