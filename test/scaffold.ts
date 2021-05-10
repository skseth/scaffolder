import { expect } from 'chai'

import { uncomment, addcomment, scaffoldProcessFile } from '../src/scaffold/scaffold_funcs'
import { ScaffoldConfig } from '../src/scaffold/ScaffoldConfig'
import { ValidationError } from 'joi';

describe("scaffold transforms", function() {
  
  it("removed comments from lines", function () {
      const comment = "##"
      const content = "## abc\n## def\n## ghi"
      const expContent = 'abc\ndef\nghi'
      const commentStr = uncomment(content, comment)
      expect(commentStr).to.equal(expContent)
  });

  
  it('add comments to lines', function () {
    const comment = '##'
    const content = 'abc\ndef\nghi'
    const expContent = '## abc\n## def\n## ghi'
    const commentStr = addcomment(content, comment)
    expect(commentStr).to.equal(expContent)
  })

})

describe('scaffold config', function () {
    it('initialized empty config', function () {
        const config = new ScaffoldConfig('')
        expect(config.ignore).to.have.all.members([])
        expect(config.process).to.have.all.members([])
        expect(config.options).to.eql({})
        expect(config.variables).to.eql({})
    })

    it('initializes ignore', function () {
        const config = new ScaffoldConfig('ignore = ["abc","def"]')
        expect(config.ignore).to.have.all.members(["abc", "def"])
    })

    it('initializes process', function () {
      const config = new ScaffoldConfig(
        '[[process]]\nname = "test"\ncomment = "**"\ninclude = ["abc","def"]'
      )
      expect(config.process).to.have.length(1)
      expect(config.process[0].name).to.equal('test')
      expect(config.process[0].comment).to.equal('**')
      expect(config.process[0].include).to.have.all.members(['abc', 'def'])
    })

    it('initializes options', function () {
      const config = new ScaffoldConfig(
        '[options]\nopt1 = "opt1"\nopt2 = "opt2"'
      )
      expect(config.options).to.eql({opt1: "opt1", opt2: "opt2"})
    })

    it('initializes variables', function () {
      const config = new ScaffoldConfig(
        '[variables]\nvar1 = "var1"\nvar2 = "var2"'
      )
      expect(config.variables).to.eql({ var1: 'var1', var2: 'var2' })
    })


    it('throws error on invalid config', function () {
      const throwtest = () =>
        new ScaffoldConfig('[variablex]\nvar1 = "var1"\nvar2 = "var2"')
      expect(throwtest).to.throw(ValidationError, /is[ ]not[ ]allowed$/)
    })

})

describe('scaffold process', function () {
    [
        {
            name: "uncommentif",
            comment: "##",
            content: `Hello, World
## {% uncommentif option_vault -%}
## abc
## def
## {%- enduncommentif %}`,
            context: {option_vault: true},
            e: `Hello, World
abc
def`
        },
        {
            name: "uncommentif",
            comment: "##",
            content: `Hello, World
## {% uncommentif option_vault -%}
## abc
## def
## {%- enduncommentif %}`,
            context: {option_vault: false},
            e: `Hello, World
## abc
## def`
        }
    ].forEach((t) => {
        it(`${t.name}`, function () {
            const retcontent = scaffoldProcessFile(
              t.comment,
              t.context,
              t.content,
              () => {}
            )
            expect(retcontent).to.equal(t.e)
        })
    })
})