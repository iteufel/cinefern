import { spawn } from 'node:child_process';
import electron from 'electron';

const expo = spawn(
  process.execPath,
  ['node_modules/expo/bin/cli', 'start', '--web', '--port', '8081'],
  { stdio: 'inherit' },
);
let desktop;
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  desktop?.kill();
  expo.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
expo.on('exit', stop);
try {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch('http://localhost:8081')).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (Date.now() >= deadline)
    throw new Error('Expo did not start within 90 seconds.');
  const desktopEnvironment = {
    ...process.env,
    CINEFERN_DEV_URL: 'http://localhost:8081',
  };
  delete desktopEnvironment.ELECTRON_RUN_AS_NODE;
  desktop = spawn(electron, ['apps/desktop'], {
    stdio: 'inherit',
    env: desktopEnvironment,
  });
  desktop.on('exit', stop);
} catch (error) {
  console.error(error);
  stop();
  process.exitCode = 1;
}
