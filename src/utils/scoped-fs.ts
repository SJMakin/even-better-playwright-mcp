/**
 * Sandboxed fs wrapper that restricts file operations to allowed directories.
 * Prevents LLM-generated code from accessing sensitive system files.
 * 
 * Allowed directories by default:
 * - Current working directory (process.cwd())
 * - /tmp
 * - os.tmpdir()
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export class ScopedFS {
  private allowedDirs: string[];

  constructor(allowedDirs?: string[]) {
    const defaultDirs = [process.cwd(), '/tmp', os.tmpdir()];
    const dirs = allowedDirs ?? defaultDirs;
    this.allowedDirs = [...new Set(dirs.map((d) => path.resolve(d)))];
  }

  private isPathAllowed(resolved: string): boolean {
    return this.allowedDirs.some((dir) => {
      return resolved === dir || resolved.startsWith(dir + path.sep);
    });
  }

  private resolvePath(filePath: string): string {
    const resolved = path.resolve(filePath);

    if (!this.isPathAllowed(resolved)) {
      const error = new Error(
        `EPERM: operation not permitted, access outside allowed directories: ${filePath}`
      ) as NodeJS.ErrnoException;
      error.code = 'EPERM';
      error.errno = -1;
      error.syscall = 'access';
      error.path = filePath;
      throw error;
    }
    return resolved;
  }

  // Sync methods
  readFileSync = (filePath: fs.PathOrFileDescriptor, options?: any): any => {
    const resolved = this.resolvePath(filePath.toString());
    return fs.readFileSync(resolved, options);
  };

  writeFileSync = (filePath: fs.PathOrFileDescriptor, data: any, options?: any): void => {
    const resolved = this.resolvePath(filePath.toString());
    fs.writeFileSync(resolved, data, options);
  };

  appendFileSync = (filePath: fs.PathOrFileDescriptor, data: any, options?: any): void => {
    const resolved = this.resolvePath(filePath.toString());
    fs.appendFileSync(resolved, data, options);
  };

  readdirSync = (dirPath: fs.PathLike, options?: any): any => {
    const resolved = this.resolvePath(dirPath.toString());
    return fs.readdirSync(resolved, options);
  };

  mkdirSync = (dirPath: fs.PathLike, options?: any): any => {
    const resolved = this.resolvePath(dirPath.toString());
    return fs.mkdirSync(resolved, options);
  };

  rmdirSync = (dirPath: fs.PathLike, options?: any): void => {
    const resolved = this.resolvePath(dirPath.toString());
    fs.rmdirSync(resolved, options);
  };

  unlinkSync = (filePath: fs.PathLike): void => {
    const resolved = this.resolvePath(filePath.toString());
    fs.unlinkSync(resolved);
  };

  statSync = (filePath: fs.PathLike, options?: any): any => {
    const resolved = this.resolvePath(filePath.toString());
    return fs.statSync(resolved, options);
  };

  lstatSync = (filePath: fs.PathLike, options?: any): any => {
    const resolved = this.resolvePath(filePath.toString());
    return fs.lstatSync(resolved, options);
  };

  existsSync = (filePath: fs.PathLike): boolean => {
    try {
      const resolved = this.resolvePath(filePath.toString());
      return fs.existsSync(resolved);
    } catch {
      return false;
    }
  };

  accessSync = (filePath: fs.PathLike, mode?: number): void => {
    const resolved = this.resolvePath(filePath.toString());
    fs.accessSync(resolved, mode);
  };

  copyFileSync = (src: fs.PathLike, dest: fs.PathLike, mode?: number): void => {
    const resolvedSrc = this.resolvePath(src.toString());
    const resolvedDest = this.resolvePath(dest.toString());
    fs.copyFileSync(resolvedSrc, resolvedDest, mode);
  };

  renameSync = (oldPath: fs.PathLike, newPath: fs.PathLike): void => {
    const resolvedOld = this.resolvePath(oldPath.toString());
    const resolvedNew = this.resolvePath(newPath.toString());
    fs.renameSync(resolvedOld, resolvedNew);
  };

  rmSync = (filePath: fs.PathLike, options?: fs.RmOptions): void => {
    const resolved = this.resolvePath(filePath.toString());
    fs.rmSync(resolved, options);
  };

  // Async callback methods
  readFile = (filePath: any, ...args: any[]): void => {
    const resolved = this.resolvePath(filePath.toString());
    (fs.readFile as any)(resolved, ...args);
  };

  writeFile = (filePath: any, data: any, ...args: any[]): void => {
    const resolved = this.resolvePath(filePath.toString());
    (fs.writeFile as any)(resolved, data, ...args);
  };

  appendFile = (filePath: any, data: any, ...args: any[]): void => {
    const resolved = this.resolvePath(filePath.toString());
    (fs.appendFile as any)(resolved, data, ...args);
  };

  readdir = (dirPath: any, ...args: any[]): void => {
    const resolved = this.resolvePath(dirPath.toString());
    (fs.readdir as any)(resolved, ...args);
  };

  mkdir = (dirPath: any, ...args: any[]): void => {
    const resolved = this.resolvePath(dirPath.toString());
    (fs.mkdir as any)(resolved, ...args);
  };

  rmdir = (dirPath: any, ...args: any[]): void => {
    const resolved = this.resolvePath(dirPath.toString());
    (fs.rmdir as any)(resolved, ...args);
  };

  unlink = (filePath: any, callback: any): void => {
    const resolved = this.resolvePath(filePath.toString());
    fs.unlink(resolved, callback);
  };

  stat = (filePath: any, ...args: any[]): void => {
    const resolved = this.resolvePath(filePath.toString());
    (fs.stat as any)(resolved, ...args);
  };

  lstat = (filePath: any, ...args: any[]): void => {
    const resolved = this.resolvePath(filePath.toString());
    (fs.lstat as any)(resolved, ...args);
  };

  access = (filePath: any, ...args: any[]): void => {
    const resolved = this.resolvePath(filePath.toString());
    (fs.access as any)(resolved, ...args);
  };

  copyFile = (src: any, dest: any, ...args: any[]): void => {
    const resolvedSrc = this.resolvePath(src.toString());
    const resolvedDest = this.resolvePath(dest.toString());
    (fs.copyFile as any)(resolvedSrc, resolvedDest, ...args);
  };

  rename = (oldPath: any, newPath: any, callback: any): void => {
    const resolvedOld = this.resolvePath(oldPath.toString());
    const resolvedNew = this.resolvePath(newPath.toString());
    fs.rename(resolvedOld, resolvedNew, callback);
  };

  rm = (filePath: any, ...args: any[]): void => {
    const resolved = this.resolvePath(filePath.toString());
    (fs.rm as any)(resolved, ...args);
  };

  exists = (filePath: any, callback: any): void => {
    try {
      const resolved = this.resolvePath(filePath.toString());
      fs.exists(resolved, callback);
    } catch {
      callback(false);
    }
  };

  // Stream methods
  createReadStream = (filePath: fs.PathLike, options?: any): fs.ReadStream => {
    const resolved = this.resolvePath(filePath.toString());
    return fs.createReadStream(resolved, options);
  };

  createWriteStream = (filePath: fs.PathLike, options?: any): fs.WriteStream => {
    const resolved = this.resolvePath(filePath.toString());
    return fs.createWriteStream(resolved, options);
  };

  // Watch methods
  watch = (filePath: any, ...args: any[]): fs.FSWatcher => {
    const resolved = this.resolvePath(filePath.toString());
    return (fs.watch as any)(resolved, ...args);
  };

  watchFile = (filePath: any, ...args: any[]): fs.StatWatcher => {
    const resolved = this.resolvePath(filePath.toString());
    return (fs.watchFile as any)(resolved, ...args);
  };

  unwatchFile = (filePath: any, listener?: any): void => {
    const resolved = this.resolvePath(filePath.toString());
    fs.unwatchFile(resolved, listener);
  };

  // Promise-based API (fs.promises equivalent)
  get promises() {
    const self = this;
    return {
      readFile: async (filePath: fs.PathLike, options?: any) => {
        const resolved = self.resolvePath(filePath.toString());
        return fs.promises.readFile(resolved, options);
      },
      writeFile: async (filePath: fs.PathLike, data: any, options?: any) => {
        const resolved = self.resolvePath(filePath.toString());
        return fs.promises.writeFile(resolved, data, options);
      },
      appendFile: async (filePath: fs.PathLike, data: any, options?: any) => {
        const resolved = self.resolvePath(filePath.toString());
        return fs.promises.appendFile(resolved, data, options);
      },
      readdir: async (dirPath: fs.PathLike, options?: any) => {
        const resolved = self.resolvePath(dirPath.toString());
        return fs.promises.readdir(resolved, options);
      },
      mkdir: async (dirPath: fs.PathLike, options?: any) => {
        const resolved = self.resolvePath(dirPath.toString());
        return fs.promises.mkdir(resolved, options);
      },
      rmdir: async (dirPath: fs.PathLike, options?: any) => {
        const resolved = self.resolvePath(dirPath.toString());
        return fs.promises.rmdir(resolved, options);
      },
      unlink: async (filePath: fs.PathLike) => {
        const resolved = self.resolvePath(filePath.toString());
        return fs.promises.unlink(resolved);
      },
      stat: async (filePath: fs.PathLike, options?: any) => {
        const resolved = self.resolvePath(filePath.toString());
        return fs.promises.stat(resolved, options);
      },
      lstat: async (filePath: fs.PathLike, options?: any) => {
        const resolved = self.resolvePath(filePath.toString());
        return fs.promises.lstat(resolved, options);
      },
      access: async (filePath: fs.PathLike, mode?: number) => {
        const resolved = self.resolvePath(filePath.toString());
        return fs.promises.access(resolved, mode);
      },
      copyFile: async (src: fs.PathLike, dest: fs.PathLike, mode?: number) => {
        const resolved = self.resolvePath(src.toString());
        const resolvedDest = self.resolvePath(dest.toString());
        return fs.promises.copyFile(resolved, resolvedDest, mode);
      },
      rename: async (oldPath: fs.PathLike, newPath: fs.PathLike) => {
        const resolvedOld = self.resolvePath(oldPath.toString());
        const resolvedNew = self.resolvePath(newPath.toString());
        return fs.promises.rename(resolvedOld, resolvedNew);
      },
      rm: async (filePath: fs.PathLike, options?: fs.RmOptions) => {
        const resolved = self.resolvePath(filePath.toString());
        return fs.promises.rm(resolved, options);
      },
    };
  }

  // Constants passthrough
  constants = fs.constants;
}

/**
 * Create a scoped fs instance with allowed directories.
 */
export function createScopedFS(allowedDirs?: string[]): ScopedFS {
  return new ScopedFS(allowedDirs);
}
