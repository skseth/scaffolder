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