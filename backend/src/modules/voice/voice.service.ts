import { runAgent, AgentReply, clearSession } from './agent';

/**
 * Public voice-module surface. Thin wrapper around the agent loop so the
 * controller doesn't need to know the internals.
 */
export class VoiceService {
  /**
   * Process one user turn through the tool-calling agent.
   */
  async chat(userId: string, message: string, sessionId?: string): Promise<AgentReply> {
    return runAgent(userId, message, sessionId);
  }

  /**
   * Legacy single-shot entry point kept for the existing /api/voice/command
   * route. Delegates to the same agent loop so behavior is consistent.
   */
  async processCommand(
    userId: string,
    transcript: string,
  ): Promise<{ success: boolean; message: string; data?: unknown; toolCalls?: unknown }> {
    const res = await this.chat(userId, transcript);
    return {
      success: res.toolCalls.every((t) => !t.error),
      message: res.reply || 'Done.',
      data: res.toolCalls,
      toolCalls: res.toolCalls,
    };
  }

  clearSession(userId: string, sessionId?: string): void {
    clearSession(userId, sessionId);
  }
}

export const voiceService = new VoiceService();
