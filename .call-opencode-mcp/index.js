import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "batch-prompt-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const OPENCODE_EXE = 'C:\\Users\\22786\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe';
const BATCH_DIR = path.resolve(path.dirname(process.argv[1]), '..');

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
    const model = 'openrouter/deepseek/deepseek-v4-flash';
    const args = ['run', '--dir', dir, '-m', model, '--format', 'json'];
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
      description: "Run opencode in a worktree directory. If sessionId is provided, continues an existing session. Otherwise starts a new session and returns the sessionId.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Worktree full path" },
          instruction: { type: "string", description: "Task instruction for opencode" },
          sessionId: { type: "string", description: "Optional: existing session ID to continue" }
        },
        required: ["path", "instruction"]
      }
    }
  ]
}));

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

    r = await runGit(repoDir, ['branch', '-r']);
    let remotes = r.stdout || '';
    let defaultBranch = remotes.includes('origin/main') ? 'main'
      : remotes.includes('origin/master') ? 'master'
      : remotes.includes('origin/dev') ? 'dev'
      : null;

    if (!defaultBranch) {
      r = await runGit(repoDir, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
      const match = r.stdout.match(/origin\/(.+)/);
      if (match) defaultBranch = match[1].trim();
    }

    if (!defaultBranch) {
      for (const b of ['main', 'master', 'dev']) {
        r = await runGit(repoDir, ['rev-parse', '--verify', b]);
        if (r.code === 0) { defaultBranch = b; break; }
      }
    }

    if (!defaultBranch) {
      throw new McpError(ErrorCode.InternalError, 'Could not detect default branch (main/master/dev)');
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
    const { path: worktreePath, instruction, sessionId: existingSessionId } = args;
    if (!worktreePath || !instruction) {
      throw new McpError(ErrorCode.InvalidParams, "path and instruction are required");
    }

    const resolvedPath = path.resolve(worktreePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new McpError(ErrorCode.InvalidParams,
        `Directory does not exist: ${worktreePath} (resolved: ${resolvedPath})`);
    }

    const projectConfigSrc = path.join(BATCH_DIR, 'project-opencode.json');
    const opencodeConfigDest = path.join(resolvedPath, 'opencode.json');
    if (fs.existsSync(projectConfigSrc)) {
      fs.copyFileSync(projectConfigSrc, opencodeConfigDest);
    }

    const { stdout, stderr, code } = await runOpenCode(worktreePath, instruction, existingSessionId);
    if (code !== 0) {
      throw new McpError(ErrorCode.InternalError,
        `opencode_run failed (exit ${code}): ${(stderr || stdout).substring(0, 2000)}`);
    }

    let sessionId = existingSessionId || '';
    let rawOutput = '';
    for (const line of stdout.split('\n')) {
      try {
        const evt = JSON.parse(line);
        if (!existingSessionId && evt.sessionID) sessionId = evt.sessionID;
        if (evt.type === 'text' && evt.part && evt.part.text) {
          rawOutput += evt.part.text + '\n';
        }
      } catch (e) {}
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ sessionId, rawOutput: rawOutput.trim() })
      }]
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
