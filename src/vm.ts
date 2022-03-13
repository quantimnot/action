import * as fs from 'fs'
import * as path from 'path'
import {ChildProcess} from 'child_process'

import * as core from '@actions/core'
import * as exec from '@actions/exec'

import * as vm from './vm'
import {ExecuteOptions} from './utility'
import {wait} from './wait'

export enum Accelerator {
  hvf,
  tcg
}

export interface Configuration {
  memory: string
  cpuCount: number
  diskImage: fs.PathLike
  ssHostPort: number

  // qemu
  cpu: string
  accelerator: Accelerator
  machineType: string

  // xhyve
  uuid: string
  resourcesDiskImage: fs.PathLike
  userboot: fs.PathLike
  firmware?: fs.PathLike
}

export abstract class Vm {
  ipAddress!: string

  static readonly user = 'runner'
  protected vmProcess!: ChildProcess
  protected readonly configuration: vm.Configuration
  protected readonly hypervisorDirectory: fs.PathLike
  protected readonly resourcesDirectory: fs.PathLike
  protected readonly hypervisorPath: fs.PathLike

  constructor(
    hypervisorDirectory: fs.PathLike,
    resourcesDirectory: fs.PathLike,
    hypervisorBinary: fs.PathLike,
    configuration: vm.Configuration
  ) {
    this.hypervisorDirectory = hypervisorDirectory
    this.resourcesDirectory = resourcesDirectory
    this.configuration = configuration
    this.hypervisorPath = path.join(
      hypervisorDirectory.toString(),
      hypervisorBinary.toString()
    )
  }

  async init(): Promise<void> {
    core.info('Initializing VM')
  }

  async run(): Promise<void> {
    core.info('Booting VM')
    core.debug(this.command.join(' '))
    exec.exec('sudo', this.command, { silent: false })
    /*this.vmProcess = execFile('sudo', this.command, (error, stdout, stderr) => {
      if (error) {
        core.debug(`Stack: ${error.stack ?? 'no stack'}`)
        core.debug(`Error code: ${(error.code ?? -1).toString()}`)
        core.debug(`Signal recieved: ${error.signal ?? 'no signal'}`)
      }

      core.debug(`Stdout: ${stdout}`)
      core.debug(`Stderr: ${stderr}`)
    })*/
    // this.vmProcess = spawn('sudo', this.command, {detached: false})
    this.ipAddress = await this.getIpAddress()
  }

  async wait(timeout: number): Promise<void> {
    for (let index = 0; index < timeout; index++) {
      core.info('Waiting for VM to be ready...')

      const result = await this.execute('true', {
        /*log: false,
          silent: true,*/
        ignoreReturnCode: true
      })

      if (result === 0) {
        core.info('VM is ready')
        return
      }
      await wait(1000)
    }

    throw Error(
      `Waiting for VM to become ready timed out after ${timeout} seconds`
    )
  }

  async stop(): Promise<void> {
    core.info('Shuting down VM')
    await this.shutdown()
  }

  async terminate(): Promise<number> {
    core.info('Terminating VM')
    return await exec.exec(
      'sudo',
      ['kill', '-s', 'TERM', this.vmProcess.pid.toString()],
      {ignoreReturnCode: true}
    )
  }

  protected async shutdown(): Promise<void> {
    throw Error('Not implemented')
  }

  async execute(
    command: string,
    options: ExecuteOptions = {}
  ): Promise<number> {
    const defaultOptions = {log: true}
    options = {...defaultOptions, ...options}
    if (options.log) core.info(`Executing command inside VM: ${command}`)
    const buffer = Buffer.from(command)

    return await exec.exec('ssh', ['-t', `${Vm.user}@${this.ipAddress}`], {
      input: buffer,
      silent: options.silent,
      ignoreReturnCode: options.ignoreReturnCode
    })
  }

  async execute2(args: string[], intput: Buffer): Promise<number> {
    return await exec.exec(
      'ssh',
      ['-t', `${Vm.user}@${this.ipAddress}`].concat(args),
      {input: intput}
    )
  }

  protected async getIpAddress(): Promise<string> {
    throw Error('Not implemented')
  }

  protected abstract get command(): string[]
}
