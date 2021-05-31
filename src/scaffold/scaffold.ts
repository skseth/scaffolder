import nunjucks from 'nunjucks'
import { ScaffoldConfig } from './ScaffoldConfig'
import fs from 'fs'
import path from 'path'
import { GitDir, GitPatternList } from '../gitdir'

type scaffoldCallback = (renamedFileName: string) => void

export function uncomment(content: string, comment: string): string {
  const regex = new RegExp(`^${comment}[ ]`, 'gm')

  return content.replace(regex, '')
}

export function addcomment(content: string, comment: string): string {
  const regex = new RegExp(`^`, 'gm')
  const replaceStr = `${comment} `

  return content.replace(regex, replaceStr)
}

type BodyFunc = () => string

class ScaffoldExtension implements nunjucks.Extension {
  tags: string[]
  private comment: string
  private renameCb: scaffoldCallback
  constructor(comment: string, renameCb: scaffoldCallback) {
    this.tags = ['uncommentif', 'commentif', 'renameif', 'replace']
    this.comment = comment
    this.renameCb = renameCb
  }

  // No open API for parser
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse(parser: any, nodes: any, _lexer: any): any {
    const cArguments = (tokvalue: string) => {
      return tokvalue === 'renameif' || tokvalue === 'replace' ? 2 : 1
    }
    const endBlock = (tokvalue: string) => {
      return tokvalue === 'renameif' ? null : `end${tokvalue}`
    }

    // get the tag token
    const tok = parser.nextToken()
    const expArguments = cArguments(tok.value)
    const endBlockName = endBlock(tok.value)

    // parse the args and move after the block end. passing true
    // as the second arg is required if there are no parentheses
    const args = parser.parseSignature(null, true)
    parser.advanceAfterBlockEnd(tok.value)

    // check number of arguments
    if (args.children.length !== expArguments) {
      console.log(`${JSON.stringify(args, null, 2)}`)
      throw `Template error: ${tok.value} must have exactly ${expArguments} parameters`
    }

    // parse the body
    let body = ''
    if (endBlockName !== null) {
      body = parser.parseUntilBlocks(endBlockName)
      parser.advanceAfterBlockEnd()
    }

    // See above for notes about CallExtension
    return new nodes.CallExtension(this, tok.value, args, [body])
  }

  uncommentif(context: unknown, cond: boolean, body: BodyFunc): string {
    if (cond) {
      return uncomment(body(), this.comment)
    } else {
      return body()
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commentif(context: unknown, cond: boolean, body: BodyFunc): string {
    if (cond) {
      return addcomment(body(), this.comment)
    } else {
      return body()
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renameif(context: unknown, cond: boolean, newName: string): string {
    if (cond) {
      this.renameCb(newName)
    }

    return ''
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replace(
    context: unknown,
    regexp: string,
    replaceVal: string,
    body: BodyFunc
  ): string {
    return body().replace(new RegExp(regexp, 'mg'), replaceVal)
  }
}

export interface ScaffoldAction {
  action: 'ignore' | 'copy' | 'process'
  filepath: string
  comment: string
}

async function* scaffoldAction(
  config: ScaffoldConfig,
  fileIter: AsyncIterableIterator<string>
): AsyncIterableIterator<ScaffoldAction> {
  const ignore = new GitPatternList(config.ignore)
  const processes = config.process.map((p) => new GitPatternList(p.include))

  for await (const filepath of fileIter) {
    const retaction: ScaffoldAction = {
      action: 'copy',
      filepath,
      comment: ''
    }

    if (ignore.matches(filepath)) {
      retaction.action = 'ignore'
    } else {
      for (let i = 0; i < processes.length; i++) {
        if (processes[i].matches(filepath)) {
          retaction.action = 'process'
          retaction.comment = config.process[i].comment
          break
        }
      }
    }

    yield retaction
  }
}

export function scaffoldProcessFile(
  comment: string,
  context: Record<string, unknown>,
  content: string,
  cb: scaffoldCallback
): string {
  const env = nunjucks.configure({ autoescape: false })
  env.addExtension('ScaffoldExtension', new ScaffoldExtension(comment, cb))
  if (comment) {
    content = content.replace(new RegExp(`^${comment}\\s+{`, 'mg'), '{')
  }
  try {
    return env.renderString(content, context)
  } catch (e) {
    console.log(`ERROR rendering template`)
    console.log(`${content}`)
    console.log(e)
    return ''
  }
}

type writeFileFunc = (filename: string, content: string) => Promise<void>
type readFileFunc = (filename: string) => Promise<string>

export async function ScaffoldProcessGeneric(
  srcIter: AsyncIterableIterator<string>,
  reader: readFileFunc,
  writer: writeFileFunc,
  targetContext: Record<string, unknown> = {}
): Promise<void> {
  const config = new ScaffoldConfig(await reader('scaffold.toml'))

  const fileactionIter = scaffoldAction(config, srcIter)
  const context = Object.assign({}, config.variables, targetContext)

  for await (const fileaction of fileactionIter) {
    if (fileaction.action === 'ignore') {
      continue
    }
    //console.log(`${fileaction.filepath} ${fileaction.action} ${fileaction.comment}`)

    // otherwise we will read and write. Only problem is what we do in between
    let content = await reader(fileaction.filepath)
    let targetFilePath = fileaction.filepath
    const targetFileDir = path.dirname(targetFilePath)
    if (fileaction.action === 'process') {
      content = scaffoldProcessFile(
        fileaction.comment,
        context,
        content,
        (renamedFileName) => {
          targetFilePath = path.join(targetFileDir, renamedFileName)
        }
      )
    }

    await writer(targetFilePath, content)
  }
}

export async function ScaffoldProcess(
  srcDir: string,
  targetDir: string,
  targetContext: Record<string, unknown> = {}
): Promise<void> {
  const reader = async (filepath: string) => {
    return fs.promises
      .readFile(path.join(srcDir, filepath))
      .then((b) => b.toString())
  }

  const writer = async (filepath: string, content: string) => {
    const fullFilePath = path.join(targetDir, filepath)
    const fileDir = path.dirname(fullFilePath)
    await fs.promises.mkdir(fileDir, { recursive: true })
    await fs.promises.writeFile(fullFilePath, content)
  }

  const gitDir = await GitDir.New(srcDir)
  const fileIter = gitDir.walk('')
  return ScaffoldProcessGeneric(fileIter, reader, writer, targetContext)
}
