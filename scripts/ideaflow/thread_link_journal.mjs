import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { isHex, ensure, fail } from "./thread_link_common.mjs";
import { privateBytes } from "./thread_link_transport.mjs";

function privateDirectory(directory, create = false) {
  if (create) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  ensure(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o777) === 0o700 &&
      fs.realpathSync(directory) === path.resolve(directory),
    "journal-directory-policy",
  );
}

function syncDirectory(directory) {
  const fd = fs.openSync(
    directory,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function atomicPrivateFile(file, bytes) {
  ensure(Buffer.byteLength(bytes) <= 4 * 1024 * 1024, "journal-size-bound");
  const directory = path.dirname(file);
  privateDirectory(directory);
  if (fs.existsSync(file)) privateBytes(file, 4 * 1024 * 1024);
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(
      temporary,
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_WRONLY |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, file);
    syncDirectory(directory);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function processIdentity() {
  const text = fs.readFileSync("/proc/self/stat", "utf8");
  return `${process.pid}:${text.slice(text.lastIndexOf(")") + 2).split(/\s+/)[19]}`;
}

/** Private journals contain exact new annotation bytes, never source chat bodies. */
export function journalStore(root) {
  const location = (digest) => {
    ensure(isHex(digest), "invalid-plan-digest");
    return path.join(root, digest);
  };
  const read = (digest) => {
    const directory = location(digest);
    if (!fs.existsSync(directory)) return null;
    privateDirectory(root);
    privateDirectory(directory);
    try {
      return JSON.parse(
        privateBytes(
          path.join(directory, "journal.json"),
          4 * 1024 * 1024,
        ).toString("utf8"),
      );
    } catch (error) {
      if (error?.code === "ENOENT") {
        ensure(
          fs.readdirSync(directory).length === 0,
          "orphaned-journal-files",
        );
        return null;
      }
      throw error;
    }
  };
  return {
    root,
    read,
    otherJournals(digest) {
      privateDirectory(root);
      const names = fs
        .readdirSync(root)
        .filter((name) => isHex(name) && name !== digest);
      ensure(names.length <= 256, "journal-inventory-bound");
      return names.map(read).filter(Boolean);
    },
    async lock(digest, callback) {
      privateDirectory(root, true);
      const directory = location(digest);
      privateDirectory(directory, true);
      // One writer for this tool, including different plans for the same child.
      const lock = path.join(root, "lock");
      try {
        fs.mkdirSync(lock, { mode: 0o700 });
      } catch (error) {
        if (error?.code === "EEXIST") fail("journal-locked");
        throw error;
      }
      const owner = {
        token: randomUUID(),
        pid: process.pid,
        processIdentity: processIdentity(),
      };
      atomicPrivateFile(path.join(lock, "owner.json"), JSON.stringify(owner));
      syncDirectory(root);
      const ownsLock = () => {
        privateDirectory(lock);
        const current = JSON.parse(
          privateBytes(path.join(lock, "owner.json"), 4096).toString("utf8"),
        );
        ensure(
          current.token === owner.token &&
            current.processIdentity === owner.processIdentity,
          "journal-lock-changed",
        );
      };
      const save = (journal) => {
        ownsLock();
        ensure(journal.planDigest === digest, "journal-digest-mismatch");
        atomicPrivateFile(
          path.join(directory, "journal.json"),
          `${JSON.stringify(journal, null, 2)}\n`,
        );
      };
      try {
        return await callback({ read: () => read(digest), save });
      } finally {
        ownsLock();
        fs.unlinkSync(path.join(lock, "owner.json"));
        fs.rmdirSync(lock);
        syncDirectory(root);
      }
    },
  };
}

/** A plan output is new/exclusive, private and flushed before reporting success. */
export function writePlan(file, bytes) {
  ensure(Buffer.byteLength(bytes) <= 1024 * 1024, "plan-size-bound");
  const fd = fs.openSync(
    file,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  syncDirectory(path.dirname(path.resolve(file)));
}
