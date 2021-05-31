import toml from 'toml'
import Joi from 'joi'

const schema = Joi.object({
  ignore: Joi.array().items(Joi.string()),
  copy: Joi.array().items(Joi.string()),
  process: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      comment: Joi.string().min(2),
      include: Joi.array().items(Joi.string()).min(1)
    })
  ),
  variables: Joi.object().pattern(/\w+/, Joi.any())
})

export interface ProcessConfig {
  name: string
  comment: string
  include: string[]
}

interface InputConfig {
  ignore?: string[]
  process?: ProcessConfig[]
  variables?: Record<string, unknown>
}

export class ScaffoldConfig {
  ignore: string[]
  process: ProcessConfig[]
  variables: Record<string, unknown>

  constructor(content: string) {
    const tomlcontents = this.readConfig(content)
    this.ignore = tomlcontents?.ignore || []
    this.process = tomlcontents?.process || []
    this.variables = tomlcontents?.variables || {}
  }

  private readConfig(content: string): InputConfig {
    let obj: InputConfig = {}
    try {
      obj = toml.parse(content)
    } catch (e) {
      console.error(
        'ScaffoldConfig: Parsing error on line ' +
          e.line +
          ', column ' +
          e.column +
          ': ' +
          e.message
      )
      throw e
    }
    const { error } = schema.validate(obj)
    if (error) {
      throw error
    }
    return obj
  }
}
