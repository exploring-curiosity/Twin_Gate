import { useState, useEffect, useRef } from 'react';
import { Send, Plus, Users, Bot } from 'lucide-react';

interface Room { id: string; name: string; description: string; created_at: string }
interface Message {
  id: number; room_id: string; sender_id: string; sender_name: string;
  content: string; is_agent: number; agent_owner: string | null; timestamp: number;
}

export function GroupChat() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: '', description: '' });
  const [showCreate, setShowCreate] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadRooms(); }, []);
  useEffect(() => { if (activeRoom) loadMessages(activeRoom); }, [activeRoom]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadRooms() {
    const res = await fetch('/api/social/rooms');
    setRooms(await res.json());
  }

  async function loadMessages(roomId: string) {
    const res = await fetch(`/api/social/rooms/${roomId}/messages`);
    setMessages(await res.json());
  }

  async function createRoom() {
    if (!newRoom.name) return;
    const res = await fetch('/api/social/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRoom.name, description: newRoom.description, created_by: 'self' }),
    });
    const room = await res.json();
    setRooms((prev) => [room, ...prev]);
    setActiveRoom(room.id);
    setShowCreate(false);
    setNewRoom({ name: '', description: '' });
  }

  async function sendMessage() {
    if (!input.trim() || !activeRoom) return;
    setSending(true);
    const res = await fetch('/api/social/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: activeRoom, sender_id: 'self', sender_name: 'You', content: input }),
    });
    await res.json();
    setInput('');
    setSending(false);
    loadMessages(activeRoom);
  }

  return (
    <div className="flex h-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Room list */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Rooms</span>
          <button onClick={() => setShowCreate(true)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <Plus size={16} className="text-gray-500" />
          </button>
        </div>

        {showCreate && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <input value={newRoom.name} onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
              placeholder="Room name" className="w-full px-2 py-1 text-sm rounded border dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            <input value={newRoom.description} onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
              placeholder="Description" className="w-full px-2 py-1 text-sm rounded border dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            <button onClick={createRoom} className="w-full py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700">Create</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {rooms.map((room) => (
            <button key={room.id} onClick={() => setActiveRoom(room.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                activeRoom === room.id ? 'bg-purple-50 dark:bg-purple-500/10' : ''
              }`}>
              <div className="text-sm font-medium text-gray-900 dark:text-white">{room.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{room.description}</div>
            </button>
          ))}
          {rooms.length === 0 && (
            <div className="p-4 text-center text-xs text-gray-400">No rooms yet. Create one to start.</div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {activeRoom ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.is_agent ? 'justify-start' : msg.sender_id === 'self' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    msg.is_agent
                      ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30'
                      : msg.sender_id === 'self'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {msg.is_agent && <Bot size={12} className="text-blue-500" />}
                      <span className={`text-xs font-medium ${
                        msg.sender_id === 'self' ? 'text-purple-200' : msg.is_agent ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                      }`}>{msg.sender_name}</span>
                    </div>
                    <p className={`text-sm m-0 ${
                      msg.sender_id === 'self' ? 'text-white' : 'text-gray-800 dark:text-gray-200'
                    }`}>{msg.content}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Type a message... (agents will evaluate)"
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                  disabled={sending} />
                <button onClick={sendMessage} disabled={sending || !input.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
            <div className="text-center">
              <Users size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a room or create one to start</p>
              <p className="text-xs mt-1">Agents will evaluate messages and respond on behalf of users</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
