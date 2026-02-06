#!/usr/bin/env node
/**
 * Cross-platform start script wrapper
 * Detects the platform and runs the appropriate start script
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const scriptDir = __dirname;
const projectRoot = path.dirname(scriptDir);

// Determine which script to run
let scriptPath;
let command;
let args;

if (isWindows) {
  scriptPath = path.join(scriptDir, 'start.ps1');
  command = 'powershell';
  args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath];
} else {
  scriptPath = path.join(scriptDir, 'start.sh');
  command = 'bash';
  args = [scriptPath];
}

// Check if script exists
if (!fs.existsSync(scriptPath)) {
  console.error(`❌ Error: Start script not found at ${scriptPath}`);
  process.exit(1);
}

// Make shell script executable on Unix systems
if (!isWindows) {
  try {
    fs.chmodSync(scriptPath, '755');
  } catch (err) {
    // Ignore chmod errors
  }
}

// Spawn the process
const child = spawn(command, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: isWindows,
});

// Handle process exit
child.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle errors
child.on('error', (err) => {
  console.error(`❌ Error starting script: ${err.message}`);
  process.exit(1);
});
