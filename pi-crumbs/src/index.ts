/**
 * pi-crumbs - Leave a trail of crumbs to follow your changes
 */

import type { ExtensionAPI, ExtensionContext, SessionManager } from '@earendil-works/pi-coding-agent';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { ObjectStore } from './object-store.js';
import { sha256 } from './hash.js';
import type { FileOp, FileOpType } from './types.js';

// Types not exported from main package - defined locally
interface ToolExecutionStartEvent {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface ToolExecutionEndEvent {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

// Tools we track
const TRACKED_TOOLS = ['edit', 'write', 'delete'];

// State for tracking in-progress tool calls
interface ToolCallState {
  path: string;
  beforeHash?: string;
}

// Per-session state
interface SessionState {
  objectStore: ObjectStore;
  toolCalls: Map<string, ToolCallState>;
}

// Global session state map
const sessionStates = new Map<string, SessionState>();

/**
 * Get or create session state
 */
function getSessionState(ctx: ExtensionContext): SessionState | null {
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!sessionFile) return null;

  let state = sessionStates.get(sessionFile);
  if (!state) {
    state = {
      objectStore: new ObjectStore(sessionFile),
      toolCalls: new Map(),
    };
    sessionStates.set(sessionFile, state);
  }
  return state;
}

/**
 * Get file operation type from tool name and args
 */
function getFileOpType(toolName: string, args: Record<string, unknown>): FileOpType {
  if (toolName === 'delete') return 'delete';
  if (toolName === 'write') {
    const filePath = (args.file_path || args.path) as string;
    return existsSync(filePath) ? 'edit' : 'create';
  }
  return 'edit';
}

/**
 * Handle tool execution start
 */
async function onToolExecutionStart(event: ToolExecutionStartEvent, ctx: ExtensionContext): Promise<void> {
  try {
    const { toolCallId, toolName, args } = event;

    // Only track specific tools
    if (!TRACKED_TOOLS.includes(toolName)) return;

    const state = getSessionState(ctx);
    if (!state) return;

    const filePath = (args.file_path || args.path) as string;
    if (!filePath) return;

    // Capture before state
    const toolCallState: ToolCallState = { path: filePath };

    if (existsSync(filePath)) {
      const content = await readFile(filePath);
      const hash = sha256(content);
      toolCallState.beforeHash = hash;
      await state.objectStore.store(hash, content);
    }

    state.toolCalls.set(toolCallId, toolCallState);
  } catch (err) {
    console.error('[pi-crumbs] Error in onToolExecutionStart:', err);
  }
}

/**
 * Handle tool execution end
 */
async function onToolExecutionEnd(event: ToolExecutionEndEvent, ctx: ExtensionContext): Promise<void> {
  try {
    const { toolCallId, toolName, isError } = event;

    // Only track specific tools
    if (!TRACKED_TOOLS.includes(toolName)) return;

    // Don't record failed operations
    if (isError) return;

    const state = getSessionState(ctx);
    if (!state) return;

    const toolCallState = state.toolCalls.get(toolCallId);
    if (!toolCallState) return;

    const { path, beforeHash } = toolCallState;
    let afterHash: string | undefined;

    // Capture after state
    if (toolName === 'delete') {
      afterHash = undefined;
    } else if (existsSync(path)) {
      const content = await readFile(path);
      const hash = sha256(content);
      afterHash = hash;
      await state.objectStore.store(hash, content);
    }

    // Determine operation type
    const op = getFileOpType(toolName, { file_path: path });

    // Append file_op entry to session
    const fileOp: FileOp = {
      toolCallId,
      path,
      op,
      before: beforeHash,
      after: afterHash,
      ts: Date.now(),
    };

    // Cast sessionManager to full SessionManager to access appendCustomEntry
    const sessionManager = ctx.sessionManager as SessionManager;
    sessionManager.appendCustomEntry('file_op', fileOp);

    // Clean up tool call state
    state.toolCalls.delete(toolCallId);
  } catch (err) {
    console.error('[pi-crumbs] Error in onToolExecutionEnd:', err);
  }
}

/**
 * Extension entry point
 */
export default function (pi: ExtensionAPI) {
  // Listen to tool execution events
  pi.on('tool_execution_start', onToolExecutionStart);
  pi.on('tool_execution_end', onToolExecutionEnd);

  // Log initialization
  console.log('[pi-crumbs] Initialized - tracking file operations');
}
