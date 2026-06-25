import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { notifyQQ } from "./notify.js";

const server = new Server(
  { name: "batch-prompt-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

let opencodeRunning = false;
let lastInnerSessionId = '';
let lastInnerStdout = '';

const OPENCODE_EXE = process.env.OPENCODE_CLI || 'opencode';
const BATCH_DIR = path.resolve(path.dirname(process.argv[1]), '..', '..', '..');

function runGit(repoDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repoDir, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('error', reject);
    child.on('close', code => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code }));
  });
}

function runOpenCode(dir, instruction, existingSessionId) {
  return new Promise((resolve, reject) => {
    const args = ['run', '--dir', dir, '--format', 'json'];
    if (existingSessionId) args.push('-s', existingSessionId);
    args.push(instruction);

    const child = spawn(OPENCODE_EXE, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('error', reject);
    child.on('close', code => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code }));
  });
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_branch_worktree",
      description: "Create a git branch and corresponding worktree. Auto-detects default branch (main > master > dev). Worktree path is auto-computed as: {repoParentDir}\\worktrees\\{repoName}\\{worktreeName}\\{repoName} where worktreeName = branch with / replaced by -",
      inputSchema: {
        type: "object",
        properties: {
          repoDir: { type: "string", description: "Full path to the git repository" },
          branch: { type: "string", description: "Branch name to create (e.g. feat/add-user-form)" }
        },
        required: ["repoDir", "branch"]
      }
    },
    {
      name: "opencode_run",
      description: "Start a new opencode session in a worktree directory. Returns the sessionId.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Worktree full path" },
          instruction: { type: "string", description: "Task instruction for opencode" }
        },
        required: ["path", "instruction"]
      }
    },
    {
      name: "opencode_continue",
      description: "Continue an existing opencode session in a worktree directory.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Worktree full path" },
          sessionId: { type: "string", description: "Existing session ID to continue" },
          instruction: { type: "string", description: "Instruction to send" }
        },
        required: ["path", "sessionId", "instruction"]
      }
    }
  ]
}));

function setupWorktreeDir(worktreePath) {
  const resolvedPath = path.resolve(worktreePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new McpError(ErrorCode.InvalidParams,
      `Directory does not exist: ${worktreePath} (resolved: ${resolvedPath})`);
  }

  const src = path.join(BATCH_DIR, 'project-opencode.json');
  const dest = path.join(resolvedPath, 'opencode.json');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }

  function copyDir(srcDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir)) {
      const s = path.join(srcDir, entry);
      const d = path.join(destDir, entry);
      if (fs.statSync(s).isDirectory()) {
        copyDir(s, d);
      } else {
        fs.copyFileSync(s, d);
      }
    }
  }

  const opencodeSrc = path.join(BATCH_DIR, '.opencode');
  const opencodeDest = path.join(resolvedPath, '.opencode');
  if (fs.existsSync(opencodeSrc)) {
    copyDir(opencodeSrc, opencodeDest);
  }

  return resolvedPath;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "create_branch_worktree") {
    const { repoDir, branch } = args;
    if (!repoDir || !branch) {
      throw new McpError(ErrorCode.InvalidParams, "repoDir and branch are required");
    }

    const parentDir = path.dirname(repoDir);
    const repoName = path.basename(repoDir);
    const worktreeName = branch.replace(/\//g, '-');
    const worktreeDir = path.join(parentDir, 'worktrees', repoName, worktreeName, repoName);

    let r;

    r = await runGit(repoDir, ['rev-parse', '--git-dir']);
    if (r.code !== 0) {
      throw new McpError(ErrorCode.InternalError, `Not a git repository: ${repoDir}`);
    }

    r = await runGit(repoDir, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
    let defaultBranch = null;
    const match = r.stdout.match(/origin\/(.+)/);
    if (match) defaultBranch = match[1].trim();

    if (!defaultBranch && r.code !== 0) {
      r = await runGit(repoDir, ['remote', 'show', 'origin']);
      const m = r.stdout.match(/HEAD branch:\s*(.+)/);
      if (m) defaultBranch = m[1].trim();
    }

    if (!defaultBranch) {
      throw new McpError(ErrorCode.InternalError, 'Could not detect default branch from remote');
    }

    r = await runGit(repoDir, ['branch', '--list', branch]);
    const branchExists = r.stdout.trim().length > 0;

    if (branchExists) {
      r = await runGit(repoDir, ['worktree', 'add', worktreeDir, branch]);
    } else {
      r = await runGit(repoDir, ['worktree', 'add', '-b', branch, worktreeDir, defaultBranch]);
    }
    if (r.code !== 0) {
      throw new McpError(ErrorCode.InternalError,
        `git worktree add failed:\n${r.stdout || r.stderr}`);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ worktreePath: worktreeDir, branch })
      }]
    };
  }

  if (name === "opencode_run") {
    if (opencodeRunning) {
      throw new McpError(ErrorCode.InternalError,
        'opencode_run is already in progress. Wait for it to finish before starting another. Do NOT call opencode_run in parallel.');
    }

    const { path: worktreePath, instruction } = args;
    if (!worktreePath || !instruction) {
      throw new McpError(ErrorCode.InvalidParams, "path and instruction are required");
    }

    const resolvedPath = setupWorktreeDir(worktreePath);

    opencodeRunning = true;
    try {
      const { stdout, stderr, code } = await runOpenCode(resolvedPath, instruction);

      let sessionId = '';
      for (const line of stdout.split('\n')) {
        try {
          const evt = JSON.parse(line);
          if (evt.sessionID) sessionId = evt.sessionID;
        } catch (e) {}
      }

      if (code !== 0) {
        throw new McpError(ErrorCode.InternalError,
          `opencode_run failed (exit ${code}): ${(stderr || stdout).substring(0, 2000)}`);
      }

      lastInnerSessionId = sessionId;
      lastInnerStdout = stdout;
      notifyQQ({ ok: true, sessionId, stdout, stderr }).catch(() => {});

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ sessionId })
        }]
      };
    } finally {
      opencodeRunning = false;
    }
  }

  if (name === "opencode_continue") {
    if (opencodeRunning) {
      throw new McpError(ErrorCode.InternalError,
        'opencode_continue is already in progress. Wait for it to finish before starting another. Do NOT call opencode_continue in parallel.');
    }

    const { path: worktreePath, sessionId, instruction } = args;
    if (!worktreePath || !sessionId || !instruction) {
      throw new McpError(ErrorCode.InvalidParams, "path, sessionId and instruction are required");
    }

    const resolvedPath = setupWorktreeDir(worktreePath);

    opencodeRunning = true;
    try {
      const { stdout, stderr, code } = await runOpenCode(resolvedPath, instruction, sessionId);

      if (code !== 0) {
        await notifyQQ({ ok: false, sessionId, stdout, stderr });
        throw new McpError(ErrorCode.InternalError,
          `opencode_continue failed (exit ${code}): ${(stderr || stdout).substring(0, 2000)}`);
      }

      lastInnerSessionId = sessionId;
      lastInnerStdout = stdout;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ sessionId })
        }]
      };
    } finally {
      opencodeRunning = false;
    }
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

const __selfPath = fileURLToPath(import.meta.url);
const isInnerMCP = __selfPath.includes(path.sep + 'worktrees' + path.sep);

let notifiedExit = false;
process.on('beforeExit', () => {
  if (opencodeRunning || notifiedExit || isInnerMCP) return;
  notifiedExit = true;
  if (!lastInnerSessionId) return;
  notifyQQ({ ok: true, sessionId: lastInnerSessionId, stdout: lastInnerStdout, stderr: '' }).catch(() => {});
});
