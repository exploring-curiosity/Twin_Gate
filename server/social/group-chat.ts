import { randomUUID } from "node:crypto";
import {
  getAllAgentProfiles,
  getAgentProfile,
  createRoom,
  getRooms,
  insertRoomMessage,
  getRoomMessages,
  getPermissionConfig,
  audit,
} from "../db.js";
import { evaluateGroupMessage } from "../twin/digital-twin.js";
import { detectDistillationAttack } from "../security/validia-detector.js";
import { matchSkills, matchInterests, matchLocation, matchEmployer } from "./skill-matcher.js";

export interface GroupChatEngine {
  createRoom(name: string, description: string, createdBy: string): { id: string; name: string };
  listRooms(): unknown[];
  getMessages(roomId: string, limit?: number): unknown[];
  postMessage(roomId: string, senderId: string, senderName: string, content: string): Promise<{
    message: unknown;
    agentResponses: Array<{
      user_id: string;
      display_name: string;
      action: string;
      confidence: number;
      suggestedReply?: string;
      reasoning?: string;
    }>;
    securityResult: unknown;
  }>;
}

export function createGroupChatEngine(): GroupChatEngine {
  return {
    createRoom(name: string, description: string, createdBy: string) {
      const id = `room_${randomUUID().slice(0, 8)}`;
      createRoom(id, name, description, createdBy);
      audit("social.room_created", null, { id, name, createdBy });
      return { id, name };
    },

    listRooms() {
      return getRooms();
    },

    getMessages(roomId: string, limit = 100) {
      return getRoomMessages(roomId, limit);
    },

    async postMessage(roomId: string, senderId: string, senderName: string, content: string) {
      // 1. Security check via Validia
      const securityResult = detectDistillationAttack(content);
      if (securityResult.recommendation === "block") {
        audit("social.message_blocked", null, {
          roomId,
          senderId,
          signals: securityResult.signals,
        });
        return {
          message: null,
          agentResponses: [],
          securityResult,
        };
      }

      // 2. Store the user message
      const timestamp = Date.now();
      insertRoomMessage({
        room_id: roomId,
        sender_id: senderId,
        sender_name: senderName,
        content,
        is_agent: false,
        timestamp,
      });

      // 3. Get all agent profiles and evaluate
      const allProfiles = getAllAgentProfiles();
      const agentResponses: Array<{
        user_id: string;
        display_name: string;
        action: string;
        confidence: number;
        suggestedReply?: string;
        reasoning?: string;
      }> = [];

      // Quick pre-filter: skill/interest matching before expensive LLM calls
      const skillMatches = matchSkills(content, allProfiles);
      const interestMatches = matchInterests(content, allProfiles);
      const locationMatches = matchLocation(content, allProfiles);
      const employerMatches = matchEmployer(content, allProfiles);

      // Merge candidates (union of all matchers)
      const candidateIds = new Set([
        ...skillMatches.map((p) => p.user_id),
        ...interestMatches.map((p) => p.user_id),
        ...locationMatches.map((p) => p.user_id),
        ...employerMatches.map((p) => p.user_id),
      ]);

      // If no matcher found candidates, try all agents (for general messages)
      const candidates = candidateIds.size > 0
        ? allProfiles.filter((p) => candidateIds.has(p.user_id) && p.user_id !== senderId)
        : allProfiles.filter((p) => p.user_id !== senderId);

      // Evaluate each candidate with the digital twin
      for (const profile of candidates) {
        // Check if the agent's user has blocked this sender
        const discordConfig = getPermissionConfig("discord");
        if (discordConfig?.people?.deny?.includes(senderId)) {
          continue; // Skip — user has blocked this sender
        }

        try {
          const decision = await evaluateGroupMessage(
            { content, sender_name: senderName, room_id: roomId },
            profile as any
          );

          if (decision.action !== "ignore") {
            agentResponses.push({
              user_id: profile.user_id,
              display_name: profile.display_name as string,
              action: decision.action,
              confidence: decision.confidence,
              suggestedReply: decision.suggestedReply,
              reasoning: decision.reasoning,
            });

            // Store agent response as a room message
            if (decision.suggestedReply) {
              insertRoomMessage({
                room_id: roomId,
                sender_id: `agent_${profile.user_id}`,
                sender_name: `${profile.display_name}'s Agent`,
                content: decision.suggestedReply,
                is_agent: true,
                agent_owner: profile.user_id,
                decision_json: JSON.stringify(decision),
                timestamp: Date.now(),
              });
            }
          }
        } catch (err: any) {
          console.error(`[GroupChat] Agent eval error for ${profile.user_id}:`, err.message);
        }
      }

      audit("social.message_posted", null, {
        roomId,
        senderId,
        agentResponses: agentResponses.length,
        candidates: candidates.length,
      });

      return {
        message: { room_id: roomId, sender_id: senderId, sender_name: senderName, content, timestamp },
        agentResponses,
        securityResult,
      };
    },
  };
}
