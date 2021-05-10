# Scaffolder

The scaffolder is tool to scaffold applications using commented, jinja2 style templates.

The key goal is that no central orchestration is needed for scaffolding, 
instead every file expresses what it needs to do for scaffolding itself.


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

The component uses "nunjucks" library from Mozilla for the templating. On top of nunjucks, the library decomments the template commands, and adds four custom commands :

* renameif cond (boolean), newname (string)
* uncommentif cond (boolean)
* commentif cond (boolean)
* replace regex-string, string

## scaffold.toml

The library expects the src project to contain a file called scaffold.toml. 

It has 4 sections :

* ignore - a list of gitignore-like patterns for files to ignore during scaffolding
* process - multiple sections of process can exist. Each process defines the comment
  to be used (e.g. // or ##), and the pattern of files to which the process applies
* variables - key / value pairs of variables used during scaffolding e.g service_prefix
* options - exactly like variables, but usually are switches / booleans to turn things on or off e.g. option_vault.

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

[options]
  rpm_enabled = true

```

## Scaffolding Process

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