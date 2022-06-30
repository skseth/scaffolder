# Scaffolder

The scaffolder is tool to scaffold applications using commented, [jinja2](https://jinja.palletsprojects.com/en/3.0.x/) style templates.

The key goal is that no central orchestration is needed for scaffolding, 
instead every file expresses what it needs to do for scaffolding itself.

A second goal is that the templated project is fully functional code, which can be maintained naturally, with minimal sprinkling of scaffolding commands.

If these are not your goals, then you can just use regular scaffolding tools, e.g. yeoman itself.

## Example of Scaffolding a file

For example, assume you have a file 'payment-service.go'. The following code will
rename the file and replace the package names

```go
// {% renameif true, [service_prefix,"-service.go"] | join() -%}
package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

// {% replace "github.com/twCatalyst/service-starter-golang-2", service_package -%}
	config "github.com/twCatalyst/service-starter-golang-2/config"
	log "github.com/twCatalyst/service-starter-golang-2/log"
	server "github.com/twCatalyst/service-starter-golang-2/pkg/server"
// {% endreplace -%}
)

```

## Template Commands

The component uses [nunjucks](https://mozilla.github.io/nunjucks/templating.html) library from Mozilla for the templating based on jinja2 specification. On top of nunjucks, the library decomments the template commands, and adds four custom commands :

* renameif cond (boolean), newname (string) - renames the file being processed
* uncommentif cond (boolean) - uncomments lines upto enduncommentif
* commentif cond (boolean) - comments lines upto endcommentif (should be rarely needed)
* replace regex-string, string - replace a regex in text upto endreplace

TODO: A renamedir command is pending, and should be implemented soon

Of course, you can use the entire templating language available in nunjucks - basically anything jinja2 allows. 

However, it is best to restrict scaffolding to :
* remove or uncomment some lines
* renaming files or directories

In particular, don't actually use templating variables within your code. That defeats the idea of using comments.

## scaffold.toml

The library expects the root of the scaffolded project to contain a file called scaffold.toml. 

It has 3 sections :

* ignore - a list of [gitignore-like patterns](https://git-scm.com/docs/gitignore) for files to ignore during scaffolding
* process - multiple sections of process can exist. Each process defines the comment
  to be used (e.g. // or ##), and the pattern of files to which the process applies
* variables - key / value pairs of variables used during scaffolding e.g service_prefix

Here is a sample file :

```t
ignore = [
".git/",
".idea/",
"/scaffold.toml",
"README.md",
"/docs/",
"out/",
"go.sum"
]

[[process]]
name = "clike"
comment = "//"
include = [
    "*.go",
    "go.mod"
]

[[process]]
name = "shelllike"
comment = "##"
include = [
    "makefile",
    "Dockerfile",
    "*.yml",
    "*.spec",
    "*.service"
]

[variables]
service_prefix = "payment"
option_vault = true
```

## Scaffolding - Standalone

The scaffolding process can be kicked off thus :

```js
import { ScaffoldProcess } from '@skseth/scaffolder'

const context = {
    service_prefix: 'order',
    option_vault: false
}

ScaffoldProcess(srcDir, destDir, context)
    .then(console.log("Done))

```

## Scaffolding - Integration with Yeoman

The following is an example of integrating the scaffolder with Yeoman.

In the example, the scaffold folder sits under the root folder of the project it is meant to scaffold. eg.

```text
project_root/
├── src/
│   ├── file1
│   └── file2
├── scaffold.toml
├── scaffold/
│   └── generators/
│       └── app/
│           └── index.js (the file below)
├── Makefile
└── ... other scaffolded project files and directories
```

```javascript
"use strict";

const Generator = require('yeoman-generator');
const scaffold = require('@skseth/scaffolder')
const fs = require('fs')
const path = require('path');

module.exports = class extends Generator {
  constructor(args, opts) {
      super(args, opts);
  }

  async prompting() {
    // Replace this with your own prompts
    this.answers = await this.prompt([
      {
        type: "input",
        name: "service_prefix",
        message: "Service Prefix (e.g. payment, order)",
        default: 'payment' // Default to current folder name
      },
      {
        type: "confirm",
        name: "option_vault",
        default: true,
        message: "Would you like to enable vault?"
      }    
    ]);

    // 
    const srcSliceStr = '/scaffold/generators/app/templates'
    // This is required because usually source templates are placed under the scaffold/../templates directory in yeoman
    // We want to use the parent of the scaffold folder as the template root folder
    if (this.sourceRoot().endsWith(srcSliceStr)) {
      this.sourceRoot(this.sourceRoot().slice(0,-(srcSliceStr.length)))
    }
  }

  // the same code should work with all generators - you probably don't need to modify
  async writing() {

    // read async from fs
    const reader = async (filepath) => {
      console.log(`read ${filepath}`)
      return fs.promises.readFile(this.templatePath(filepath)).then((b) => b.toString())
    }

    // write sync to memfs
    const writer = (filepath, content) => this.fs.write(this.destinationPath(filepath), content)

    // filter git ignored files
    const gitDir = await scaffold.GitDir.New(this.sourceRoot())
    await scaffold.ScaffoldProcessGeneric(gitDir.walk(), reader, writer, this.answers)  

  }
};

```

# API

## Scaffold API

The publicly exposed API are as follows :

#### ScaffoldProcess

Provide a source directory, a target directory, and a set of variables in targetContext. The process converts files as defined in the 'scaffold.toml' in the source root. 

Useful when you have a physical filesystem.

Note that the process respects .gitignore files - any files listed in .gitignore are not copied.

```typescript
async function ScaffoldProcess(
  srcDir: string,
  targetDir: string,
  targetContext: Record<string, unknown> = {}
)
```

#### ScaffoldProcessGeneric

What happens if you don't have a "real" file system? Perhaps you are reading a github repo over the web. In Yeoman, the output goes to a memfs file system. You may not want to skip .gitignore files.

If so, use ScaffoldProcessGeneric. Of course, ScaffoldProcess uses ScaffoldProcessGeneric under the hood.

```typescript
async function ScaffoldProcessGeneric(
  srcIter: AsyncIterableIterator<string>,
  reader: readFileFunc,
  writer: writeFileFunc,
  targetContext: Record<string, unknown> = {}
)

type writeFileFunc = (filename: string, content: string) => Promise<void>
type readFileFunc = (filename: string) => Promise<string>
```

You have to provide a filename iterator, and a read and write function. 

## GitDir API

Note: This API may be pulled out into a separate package in future

#### GitDir

GitDir lets you "walk" a git repository for files, ignoring gitignored files. It supports all gitignore rules described in the [gitignore documentation](https://git-scm.com/docs/gitignore). It also handles nested .gitignore files.

The one rule I am aware of which it violates is that files in the git index will be ignored - the gitignore command does not ignore such files. This pattern is used occasionally to *stop* a certain file in the repo from changing. 

```typescript
class GitDir {
  static async New(dirpath: string, parent?: GitDir): Promise<GitDir> {...}
  async *walk(relPath = ''): AsyncIterableIterator<string> {...}
}

// Use it this way 
const gitDir = await scaffold.GitDir.New("./scaffolder")
await scaffold.ScaffoldProcessGeneric(gitDir.walk(), reader, writer, this.answers)  
```

But ... why not just use one of existing packages which do so? Unfortunately I tried a few and they were riddled with bugs (For ex. "\*.js" ignoring "\*.json"), or the gitignore code was part of a much bigger library.

Ultimately, I was forced to write this.

#### GitPatternList

As a bonus, GitPatternList can help you build your own gitignore pattern matching solutions.

```typescript
class GitPatternList {
  constructor(patternArray: string[])
  matches(str: string): boolean 
}

// Use it this way

const pattern = new GitPatternList([
  "/docs/",
  "out/",
  "go.sum"
])

pattern.matches("abc/docs/hello") // returns false
pattern.matches("docs/hello") // returns true
pattern.matches("abc/out/hello") // returns true
```