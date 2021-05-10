const fs = require('fs')
const path = require('path')
let source = require('../package.json')

function main() {
  source.scripts = {}
  source.devDependencies = {}
  if (source.main.startsWith('dist/')) {
    source.main = source.main.slice(5)
  }

  if (source.typings.startsWith('dist/')) {
    source.typings = source.typings.slice(5)
  }

  fs.writeFileSync(path.join('dist', 'package.json'),
    Buffer.from(JSON.stringify(source, null, 2), 'utf-8')
  )
  fs.writeFileSync(path.join('dist', 'version.txt'),
    Buffer.from(source.version, 'utf-8')
  )

  fs.copyFileSync(path.join(__dirname, '.npmignore'), path.join('dist','.npmignore'))
}

main()
