import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
// Mask terminal output while the password is typed. Never store the plaintext.
if (!process.stdin.isTTY) { console.error('Run this command in an interactive terminal.'); process.exit(1); }
let muted = false;
const output = new Writable({write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk); done(); }});
const rl = createInterface({input:process.stdin, output, terminal:true});
process.stdout.write('Choose an editor password (at least 16 characters): ');
muted = true;
const password = await rl.question('');
muted = false;
rl.close();
process.stdout.write('\n');
if (password.length < 16) { console.error('Use at least 16 characters.'); process.exit(1); }
const salt = randomBytes(16).toString('hex');
console.log('Store the following as EDITOR_PASSWORD_HASH in your backend host secret settings:');
console.log(`${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
