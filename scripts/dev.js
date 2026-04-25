import { spawn } from 'node:child_process'

const processes = []
let shuttingDown = false

function launch(name, command, args) {
  const child = spawn(command, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
    windowsHide: false,
  })

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`)
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`)
  })

  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      process.stderr.write(`[${name}] exited with code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}\n`)
      shutdown(code ?? 1)
    }
  })

  processes.push(child)
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  for (const child of processes) {
    if (!child.killed) {
      child.kill()
    }
  }

  setTimeout(() => {
    process.exit(exitCode)
  }, 150)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

launch('server', process.execPath, ['server/app.js'])
launch('web', process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'])