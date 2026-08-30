"use strict";

/**
 * Cross-platform ZIP helper shared by package-extension.cjs and package-smoke.cjs.
 * Replaces shell-dependent `zip`/`unzip` calls so packaging works identically on
 * Windows, macOS and Linux. adm-zip is pinned exactly in package.json and registered
 * in third-party-notices/OSS_REGISTER.json.
 */

const AdmZip = require("adm-zip");

/**
 * @param {string} source directory to zip
 * @param {string} destination zip file path
 */
function createZipFromDirectory(source, destination) {
  const zip = new AdmZip();
  zip.addLocalFolder(source);
  zip.writeZip(destination);
}

/**
 * @param {string} archive zip file path
 * @param {string} destination extract target directory
 * @param {boolean} overwrite
 */
function extractZip(archive, destination, overwrite = true) {
  const zip = new AdmZip(archive);
  zip.extractAllTo(destination, overwrite);
}

/**
 * List file paths (forward-slash, relative) inside a zip without extracting.
 * @param {string} archive
 * @returns {string[]}
 */
function listZip(archive) {
  const zip = new AdmZip(archive);
  return zip.getEntries().map((entry) => entry.entryName.replace(/\\/g, "/"));
}

/**
 * Read a single text file from inside a zip without extracting to disk.
 * @param {string} archive
 * @param {string} entryName
 * @returns {string}
 */
function readZipText(archive, entryName) {
  const zip = new AdmZip(archive);
  const entry = zip.getEntry(entryName);
  if (!entry) {
    throw new Error(`Entry not found in archive: ${entryName}`);
  }
  return entry.getData().toString("utf8");
}

module.exports = {
  createZipFromDirectory,
  extractZip,
  listZip,
  readZipText
};
