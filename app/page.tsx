"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Character, Mode, Provider, Settings } from "./types";

const STORAGE_KEY = "storysmith:v1";

type ProjectState = {
  settings: Settings;
  mode: Mode;
  story: string;
  prompt: string;
  scratchpad: Array<{ id: string; text: string; type: string; pinned?: boolean; createdAt: number; chapter?: string; characterId?: string }>;
  selectedCharacterId: string;
  characters: Character[];
  review: string;
  lastGeneration: string;
};

function uid() {
  return `char-${Math.random().toString(36).slice(2, 10)}`;
}

const defaultState: ProjectState = {
  settings: {
    provider: "openai",
    apiKey: "",
    model: "gpt-4.1-mini",
    writerName: "",
    tone: "Warm, observant, and slightly witty.",
    houseStyle: "Prefer vivid detail, concrete verbs, and clean dialogue.",
    spice: 3,
    contentMode: "fade_to_black",
    startMode: "balanced",
    sceneStyle: "balanced",
  },
  mode: "collaborate",
  story: "The rain hit the station roof like a handful of thrown coins.\n\n",
  prompt: "A stranger steps off the last train and notices something impossible.",
  scratchpad: [
    {
      id: "note-1",
      text: "The lantern in chapter two might actually be a clue to the missing sibling.",
      type: "plot twist",
      pinned: true,
      createdAt: Date.now(),
      chapter: "Chapter 2",
      characterId: "char-1",
    },
  ],
  selectedCharacterId: "char-1",
  characters: [
    {
      id: "char-1",
      name: "Mara Vale",
      role: "Lead investigator",
      voice: "Dry, precise, underplays emotion",
      voiceExamples: "Short, clipped replies. Never melodramatic. Says more by what she withholds.",
      voiceSamples: [
        "I’m not guessing. I’m narrowing the field.",
        "If you want comfort, speak to someone else.",
      ],
      goals: "Find the truth before dawn",
      limits: "Hates lying; refuses to carry a gun",
      quirks: "Taps a silver ring when thinking",
      notes: "Carries guilt over a missing sibling",
      links: [],
      facts: ["Left-handed", "Keeps old train tickets", "Sleeps badly after storms"],
      contradictions: [],
      memory: "Mara is methodical, privately burdened, and should remain dry-witted under pressure.",
      updatedAt: Date.now(),
    },
  ],
  review: "",
  lastGeneration: "",
};

function loadState(): ProjectState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<ProjectState>;
    return {
      ...defaultState,
      ...parsed,
      settings: {
        ...defaultState.settings,
        ...parsed.settings,
      },
    };
  } catch {
    return defaultState;
  }
}

function saveState(state: ProjectState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export default function Page() {
  const [state, setState] = useState<ProjectState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<{ inconsistencies: string[]; typos: string[] } | null>(null);
  const [popup, setPopup] = useState<string | null>(null);
  const [pendingCharacter, setPendingCharacter] = useState<Character | null>(null);
  const [streamText, setStreamText] = useState("");
  const [markdownText, setMarkdownText] = useState("");
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [storySummary, setStorySummary] = useState("");
  const [timelineEntries, setTimelineEntries] = useState<Array<{ title: string; detail: string; at: number }>>([]);
  const [scratchpadText, setScratchpadText] = useState("");
  const [scratchpadType, setScratchpadType] = useState("idea");
  const [scratchpadChapter, setScratchpadChapter] = useState("");
  const [scratchpadCharacterId, setScratchpadCharacterId] = useState("");
  const [draggingScratchpadId, setDraggingScratchpadId] = useState<string | null>(null);
  const [scratchpadSearch, setScratchpadSearch] = useState("");
  const [scratchpadInsertMode, setScratchpadInsertMode] = useState("prose");
  const [commandOpen, setCommandOpen] = useState(false);
  const [storyCursor, setStoryCursor] = useState(0);
  const storyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);

  useEffect(() => {
    setNodePositions((prev) => {
      const next = { ...prev };
      state.characters.forEach((character, index) => {
        if (!next[character.id]) {
          const angle = (Math.PI * 2 * index) / Math.max(state.characters.length, 1);
          next[character.id] = {
            x: 450 + Math.cos(angle) * 220,
            y: 260 + Math.sin(angle) * 170,
          };
        }
      });
      return next;
    });
  }, [state.characters]);

  useEffect(() => {
    if (draggingNodeId) return;
    if (!state.characters.length) return;
    const iterations = 18;
    setNodePositions((prev) => {
      const next = { ...prev };
      for (let step = 0; step < iterations; step++) {
        for (const character of state.characters) {
          const current = next[character.id] ?? { x: 450, y: 260 };
          let vx = 0;
          let vy = 0;
          for (const other of state.characters) {
            if (other.id === character.id) continue;
            const otherPos = next[other.id] ?? { x: 450, y: 260 };
            const dx = current.x - otherPos.x;
            const dy = current.y - otherPos.y;
            const dist = Math.max(Math.hypot(dx, dy), 40);
            const repel = 9000 / (dist * dist);
            vx += (dx / dist) * repel;
            vy += (dy / dist) * repel;
          }
          for (const link of character.links ?? []) {
            const otherPos = next[link.targetId];
            if (!otherPos) continue;
            const dx = otherPos.x - current.x;
            const dy = otherPos.y - current.y;
            const dist = Math.max(Math.hypot(dx, dy), 40);
            const attract = (dist - 160) * 0.015;
            vx += (dx / dist) * attract;
            vy += (dy / dist) * attract;
          }
          next[character.id] = {
            x: Math.min(860, Math.max(40, current.x + vx * 0.04)),
            y: Math.min(480, Math.max(40, current.y + vy * 0.04)),
          };
        }
      }
      return next;
    });
  }, [draggingNodeId, state.characters]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selectedCharacter = useMemo(
    () => state.characters.find((c) => c.id === state.selectedCharacterId) ?? state.characters[0],
    [state.characters, state.selectedCharacterId],
  );

  async function callApi(endpoint: string, body: unknown) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  function updateCharacter(patch: Partial<Character>) {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => (c.id === prev.selectedCharacterId ? { ...c, ...patch, updatedAt: Date.now() } : c)),
    }));
  }

  function updateLink(index: number, patch: Partial<{ targetId: string; label: string }>) {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((character) =>
        character.id === prev.selectedCharacterId
          ? {
              ...character,
              links: (character.links ?? []).map((link, linkIndex) => (linkIndex === index ? { ...link, ...patch } : link)),
              updatedAt: Date.now(),
            }
          : character,
      ),
    }));
  }

  function addLink() {
    const firstOther = state.characters.find((character) => character.id !== selectedCharacter.id);
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((character) =>
        character.id === prev.selectedCharacterId
          ? {
              ...character,
              links: [...(character.links ?? []), { targetId: firstOther?.id ?? "", label: "connected to" }],
              updatedAt: Date.now(),
            }
          : character,
      ),
    }));
    if (firstOther) pushTimelineEntry("Relationship added", `Linked ${selectedCharacter.name} to ${firstOther.name}.`);
  }

  function addPresetLink(label: string) {
    const firstOther = state.characters.find((character) => character.id !== selectedCharacter.id);
    if (!firstOther) return;
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((character) =>
        character.id === prev.selectedCharacterId
          ? {
              ...character,
              links: [...(character.links ?? []), { targetId: firstOther.id, label }],
              updatedAt: Date.now(),
            }
          : character,
      ),
    }));
    pushTimelineEntry("Relationship preset", `${label} link added for ${selectedCharacter.name} and ${firstOther.name}.`);
  }

  function addVoiceSample() {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((character) =>
        character.id === prev.selectedCharacterId
          ? {
              ...character,
              voiceSamples: [...(character.voiceSamples ?? []), ""],
              updatedAt: Date.now(),
            }
          : character,
      ),
    }));
  }

  function moveNode(id: string, x: number, y: number) {
    setNodePositions((prev) => ({ ...prev, [id]: { x, y } }));
  }

  function addCharacter() {
    const character: Character = {
      id: uid(),
      name: "New Character",
      role: "",
      facts: [],
      contradictions: [],
      memory: "",
      voiceExamples: "",
      voiceSamples: [],
      links: [],
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      characters: [...prev.characters, character],
      selectedCharacterId: character.id,
    }));
  }

  function autoLayout() {
    const positions: Record<string, { x: number; y: number }> = {};
    state.characters.forEach((character, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(state.characters.length, 1);
      positions[character.id] = {
        x: 450 + Math.cos(angle) * 220,
        y: 260 + Math.sin(angle) * 170,
      };
    });
    setNodePositions(positions);
  }

  const graphNodes = useMemo(() => state.characters, [state.characters]);
  const graphEdges = useMemo(() => {
    const edges: Array<{ from: Character; to: Character; label: string }> = [];
    for (const from of state.characters) {
      for (const link of from.links ?? []) {
        const to = state.characters.find((character) => character.id === link.targetId);
        if (to) edges.push({ from, to, label: link.label || "connected" });
      }
      const hints = `${from.relationships ?? ""} ${from.backstory ?? ""} ${from.timeline ?? ""} ${from.memory ?? ""}`.toLowerCase();
      for (const to of state.characters) {
        if (to.id === from.id) continue;
        if (hints.includes(to.name.toLowerCase()) && !edges.some((edge) => edge.from.id === from.id && edge.to.id === to.id)) {
          edges.push({ from, to, label: "mentioned" });
        }
      }
    }
    return edges;
  }, [state.characters]);

  function relationshipSummary(character: Character) {
    const parts = [
      ...(character.links ?? []).map((link) => {
        const target = state.characters.find((entry) => entry.id === link.targetId);
        return target ? `${link.label} ${target.name}` : "";
      }),
    ];
    const hints = `${character.relationships ?? ""} ${character.backstory ?? ""} ${character.timeline ?? ""} ${character.memory ?? ""}`.toLowerCase();
    const inferred = state.characters
      .filter((other) => other.id !== character.id && hints.includes(other.name.toLowerCase()))
      .map((other) => other.name);
    return [...parts, ...inferred].filter(Boolean).join(", ");
  }

  function labelColor(label: string) {
    const lower = label.toLowerCase();
    if (["sibling", "parent", "child", "family"].some((term) => lower.includes(term))) return "#f7b267";
    if (["mentor", "guide", "teacher"].some((term) => lower.includes(term))) return "#8be9b2";
    if (["rival", "enemy", "foe"].some((term) => lower.includes(term))) return "#ff7c7c";
    if (["partner", "lover", "romance", "boyfriend", "girlfriend"].some((term) => lower.includes(term))) return "#ff9bd2";
    if (["friend", "ally", "companion"].some((term) => lower.includes(term))) return "#7aa7ff";
    return "#d7deea";
  }

  function characterSnapshot(character: Character) {
    const fragments = [
      character.voiceExamples,
      character.voiceSamples?.[0],
      character.memory,
    ].filter(Boolean);
    return fragments.join(" ");
  }

  function pushTimelineEntry(title: string, detail: string) {
    setTimelineEntries((prev) => [{ title, detail, at: Date.now() }, ...prev].slice(0, 6));
  }

  function formatTimelineTime(at: number) {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(at);
  }

  function typeColor(type: string) {
    const lower = type.toLowerCase();
    if (lower.includes("plot")) return "#ff9bd2";
    if (lower.includes("dialogue")) return "#7aa7ff";
    if (lower.includes("character")) return "#8be9b2";
    return "#f7b267";
  }

  function reorderScratchpad(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    setState((prev) => {
      const items = [...prev.scratchpad];
      const fromIndex = items.findIndex((item) => item.id === dragId);
      const toIndex = items.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [moved] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, moved);
      return { ...prev, scratchpad: items };
    });
  }

  const nodeAt = (id: string) => nodePositions[id] ?? { x: 140, y: 120 };

  const orderedNodes = useMemo(() => {
    const remaining = [...graphNodes].sort((a, b) => a.name.localeCompare(b.name));
    const byLinks = new Map<string, Set<string>>();
    for (const character of graphNodes) {
      byLinks.set(character.id, new Set((character.links ?? []).map((link) => link.targetId).filter(Boolean)));
    }
    const result: Character[] = [];
    const placed = new Set<string>();
    const enqueueConnected = (id: string) => {
      for (const candidate of remaining) {
        if (placed.has(candidate.id)) continue;
        if (byLinks.get(id)?.has(candidate.id) || byLinks.get(candidate.id)?.has(id)) {
          result.push(candidate);
          placed.add(candidate.id);
        }
      }
    };
    while (remaining.length) {
      const first = remaining.shift();
      if (!first) break;
      if (placed.has(first.id)) continue;
      result.push(first);
      placed.add(first.id);
      enqueueConnected(first.id);
    }
    return result;
  }, [graphNodes]);

  function exportMarkdown() {
    const charMd = state.characters
      .map((c) => [
        `## ${c.name}`,
        `- Role: ${c.role}`,
        c.age ? `- Age: ${c.age}` : "",
        c.voice ? `- Voice: ${c.voice}` : "",
        c.voiceExamples ? `- Voice examples: ${c.voiceExamples}` : "",
        c.voiceSamples?.length ? `- Voice samples: ${c.voiceSamples.join(" || ")}` : "",
        c.appearance ? `- Appearance: ${c.appearance}` : "",
        c.relationships ? `- Relationships: ${c.relationships}` : "",
        c.links?.length ? `- Links: ${c.links.map((link) => `${link.label} -> ${link.targetId}`).join("; ")}` : "",
        c.goals ? `- Goals: ${c.goals}` : "",
        c.limits ? `- Limits: ${c.limits}` : "",
        c.quirks ? `- Quirks: ${c.quirks}` : "",
        c.backstory ? `- Backstory: ${c.backstory}` : "",
        c.timeline ? `- Timeline: ${c.timeline}` : "",
        c.secrets ? `- Secrets: ${c.secrets}` : "",
        c.memory ? `- Memory: ${c.memory}` : "",
        c.notes ? `- Notes: ${c.notes}` : "",
        c.facts.length ? `- Facts: ${c.facts.join("; ")}` : "",
      ].filter(Boolean).join("\n"))
      .join("\n\n");
    const scratchpadMd = state.scratchpad.length
      ? state.scratchpad
          .map((item) =>
            [
              `- ${new Date(item.createdAt).toISOString()} :: ${item.type} :: ${item.text}`,
              item.chapter ? `  - Chapter: ${item.chapter}` : "",
              item.characterId ? `  - Character: ${item.characterId}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n")
      : "- none";
    const md = `---\nprovider: ${state.settings.provider}\nmodel: ${state.settings.model}\nwriterName: ${state.settings.writerName}\ntone: ${JSON.stringify(state.settings.tone)}\nhouseStyle: ${JSON.stringify(state.settings.houseStyle)}\nspice: ${state.settings.spice}\ncontentMode: ${state.settings.contentMode}\nstartMode: ${state.settings.startMode}\nsceneStyle: ${state.settings.sceneStyle}\n---\n\n# Help Me Write Project\n\n## Story\n${state.story}\n\n## Prompt\n${state.prompt}\n\n## Scratchpad\n${scratchpadMd}\n\n## Characters\n${charMd}\n`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "help-me-write-project.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importMarkdown(file: File) {
    const text = await file.text();
    setMarkdownText(text);
    const lines = text.split(/\r?\n/);
    const frontmatterEnd = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    const storyStart = lines.findIndex((line) => line.trim() === "## Story");
    const promptStart = lines.findIndex((line) => line.trim() === "## Prompt");
    const charsStart = lines.findIndex((line) => line.trim() === "## Characters");
    const scratchpadStart = lines.findIndex((line) => line.trim() === "## Scratchpad");
    const next = { ...state };
    if (frontmatterEnd > 0) {
      const frontmatter = lines.slice(1, frontmatterEnd).join("\n");
      for (const row of frontmatter.split("\n")) {
        const [key, ...rest] = row.split(":");
        const value = rest.join(":").trim();
        switch (key.trim()) {
          case "provider":
            if (value === "openai" || value === "anthropic") next.settings.provider = value;
            break;
          case "model":
            next.settings.model = value;
            break;
          case "writerName":
            next.settings.writerName = value;
            break;
          case "tone":
            next.settings.tone = value.replace(/^"|"$/g, "");
            break;
          case "houseStyle":
            next.settings.houseStyle = value.replace(/^"|"$/g, "");
            break;
          case "spice":
            next.settings.spice = Number(value) || next.settings.spice;
            break;
          case "contentMode":
            if (["romance", "spicy", "fade_to_black", "closed_door"].includes(value)) next.settings.contentMode = value as Settings["contentMode"];
            break;
          case "startMode":
            if (["balanced", "suggestive", "explicit", "dialogue_heavy", "slow_burn"].includes(value)) next.settings.startMode = value as Settings["startMode"];
            break;
          case "sceneStyle":
            if (["balanced", "lush_prose", "fast_banter", "action_first"].includes(value)) next.settings.sceneStyle = value as Settings["sceneStyle"];
            break;
        }
      }
    }
    if (storyStart >= 0 && promptStart > storyStart) next.story = lines.slice(storyStart + 1, promptStart).join("\n").trim();
    if (promptStart >= 0) {
      const promptEnd = scratchpadStart > promptStart ? scratchpadStart : charsStart;
      if (promptEnd > promptStart) next.prompt = lines.slice(promptStart + 1, promptEnd).join("\n").trim();
    }
    if (scratchpadStart >= 0 && charsStart > scratchpadStart) {
      const scratchLines = lines.slice(scratchpadStart + 1, charsStart);
      const notes: Array<{ id: string; text: string; type: string; createdAt: number; chapter?: string; characterId?: string }> = [];
      let currentNote: (typeof notes)[number] | null = null;
      for (const rawLine of scratchLines) {
        const line = rawLine.trimEnd();
        if (!line) continue;
        if (line.startsWith("- ")) {
          const content = line.slice(2).trim();
          const [timestamp, type = "idea", ...rest] = content.split("::");
          currentNote = {
            id: uid(),
            createdAt: Date.parse(timestamp.trim()) || Date.now(),
            type: type.trim() || "idea",
            text: rest.join("::").trim(),
          };
          if (currentNote.text && currentNote.text !== "none") notes.push(currentNote);
          continue;
        }
        if (!currentNote || !line.startsWith("-")) continue;
        const [key, ...rest] = line.replace(/^\s*-\s*/, "").split(":");
        const value = rest.join(":").trim();
        const lowered = key.trim().toLowerCase();
        if (lowered === "chapter") currentNote.chapter = value;
        if (lowered === "character") currentNote.characterId = value;
      }
      next.scratchpad = notes;
    }
    if (charsStart >= 0) {
      const characters: Character[] = [];
      let current: Partial<Character> | null = null;
      const pushCurrent = () => {
        if (!current?.name) return;
        characters.push({
          id: uid(),
          name: current.name,
          role: current.role ?? "",
          age: current.age,
          voice: current.voice,
          voiceExamples: current.voiceExamples,
          voiceSamples: current.voiceSamples,
          goals: current.goals,
          limits: current.limits,
          quirks: current.quirks,
          appearance: current.appearance,
          relationships: current.relationships,
          backstory: current.backstory,
          timeline: current.timeline,
          secrets: current.secrets,
          notes: current.notes,
          memory: current.memory,
          facts: current.facts ?? [],
          contradictions: [],
          updatedAt: Date.now(),
        });
      };
      for (const rawLine of lines.slice(charsStart + 1)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith("## ")) {
          pushCurrent();
          current = { name: line.slice(3).trim() };
          continue;
        }
        if (!current || !line.startsWith("- ")) continue;
        const [key, ...rest] = line.slice(2).split(":");
        const value = rest.join(":").trim();
        switch (key.trim().toLowerCase()) {
          case "role":
            current.role = value;
            break;
          case "age":
            current.age = value;
            break;
          case "voice":
            current.voice = value;
            break;
          case "voice examples":
            current.voiceExamples = value;
            break;
          case "voice samples":
            current.voiceSamples = value.split("||").map((item) => item.trim()).filter(Boolean);
            break;
          case "appearance":
            current.appearance = value;
            break;
          case "relationships":
            current.relationships = value;
            break;
          case "links":
            current.links = value
              .split(";")
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item) => {
                const [label, targetId] = item.split("->").map((part) => part.trim());
                return { label: label || "connected", targetId: targetId || "" };
              })
              .filter((link) => link.targetId !== "");
            break;
          case "goals":
            current.goals = value;
            break;
          case "limits":
            current.limits = value;
            break;
          case "quirks":
            current.quirks = value;
            break;
          case "backstory":
            current.backstory = value;
            break;
          case "timeline":
            current.timeline = value;
            break;
          case "secrets":
            current.secrets = value;
            break;
          case "memory":
            current.memory = value;
            break;
          case "notes":
            current.notes = value;
            break;
          case "facts":
            current.facts = value.split(";").map((item) => item.trim()).filter(Boolean);
            break;
        }
      }
      pushCurrent();
      if (characters.length) next.characters = characters;
    }
    next.settings.apiKey = "";
    setState(next);
  }

  async function generateStory() {
    if (!state.settings.apiKey.trim()) {
      setPopup("Add an API key in Settings first.");
      return;
    }
    const payload = {
      provider: state.settings.provider,
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      contentMode: state.settings.contentMode,
      startMode: state.settings.startMode,
      sceneStyle: state.settings.sceneStyle,
      mode: state.mode,
      story: state.story,
      prompt: state.prompt,
      spice: state.settings.spice,
      writer: {
        name: state.settings.writerName,
        tone: state.settings.tone,
        houseStyle: state.settings.houseStyle,
      },
      character: selectedCharacter,
    };
    setIsGenerating(true);
    setStreamText("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const chunk = part.slice(6);
          if (chunk === "[DONE]") continue;
          fullText += chunk;
          setStreamText(fullText);
        }
      }
      const nextStory = state.mode === "collaborate" ? `${state.story.trimEnd()}\n\n${fullText.trim()}` : fullText.trim();
      setState((prev) => ({ ...prev, story: nextStory, lastGeneration: fullText }));
      pushTimelineEntry(
        state.mode === "collaborate" ? "Generated draft" : "Applied edit pass",
        fullText.trim().slice(0, 180) || "No text returned.",
      );
    } catch (error) {
      setPopup(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function reviewStory() {
    if (!state.settings.apiKey.trim()) {
      setPopup("Add an API key in Settings first.");
      return;
    }
    const result = await callApi("/api/review", {
      provider: state.settings.provider,
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      story: state.story,
      character: selectedCharacter,
    });
    setAnalysis(result);
    setState((prev) => ({ ...prev, review: result.summary ?? "" }));
    const count = (result.inconsistencies?.length ?? 0) + (result.typos?.length ?? 0);
    pushTimelineEntry("Review run", count ? `${count} item(s) flagged for attention.` : "No obvious issues found.");
  }

  function exportProject() {
    const blob = new Blob([JSON.stringify({ ...state, settings: { ...state.settings, apiKey: "" } }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "help-me-write-project.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importProject(file: File) {
    const text = await file.text();
    let incoming: Partial<ProjectState>;
    try {
      incoming = JSON.parse(text) as Partial<ProjectState>;
    } catch {
      setPopup("Failed to import: file is not valid JSON.");
      return;
    }
    setState((prev) => ({
      ...prev,
      ...incoming,
      settings: {
        ...prev.settings,
        ...incoming.settings,
        apiKey: "",
        startMode: (incoming.settings as Partial<Settings> | undefined)?.startMode ?? prev.settings.startMode,
        sceneStyle: (incoming.settings as Partial<Settings> | undefined)?.sceneStyle ?? prev.settings.sceneStyle,
      },
    }));
  }

  function addScratchpadItem() {
    const text = scratchpadText.trim();
    if (!text) return;
    setState((prev) => ({
      ...prev,
      scratchpad: [
        {
          id: uid(),
          text,
          type: scratchpadType,
          pinned: false,
          createdAt: Date.now(),
          chapter: scratchpadChapter.trim() || undefined,
          characterId: scratchpadCharacterId || undefined,
        },
        ...(prev.scratchpad ?? []),
      ],
    }));
    setScratchpadText("");
    setScratchpadChapter("");
    setScratchpadCharacterId("");
    pushTimelineEntry("Scratchpad note", text.slice(0, 180));
  }

  function removeScratchpadItem(id: string) {
    setState((prev) => ({
      ...prev,
      scratchpad: prev.scratchpad.filter((item) => item.id !== id),
    }));
  }

  function toggleScratchpadPin(id: string) {
    setState((prev) => ({
      ...prev,
      scratchpad: prev.scratchpad.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item)),
    }));
  }

  function promoteScratchpadItem(id: string) {
    const item = state.scratchpad.find((entry) => entry.id === id);
    if (!item) return;
    const prefix = item.chapter ? `${item.chapter} ` : "";
    const characterName = state.characters.find((character) => character.id === item.characterId)?.name ?? item.characterId ?? "";
    const insert =
      scratchpadInsertMode === "bullet"
        ? `\n- ${item.text}\n`
        : scratchpadInsertMode === "dialogue"
          ? `\n"${item.text}"\n`
          : `\n${prefix}${characterName ? `${characterName}: ` : ""}${item.text}\n`;
    setState((prev) => ({
      ...prev,
      story: `${prev.story.slice(0, storyCursor)}${insert}${prev.story.slice(storyCursor)}`,
    }));
    pushTimelineEntry("Promoted idea", item.text.slice(0, 180));
  }

  function suggestStartMode(promptText: string): Settings["startMode"] {
    const text = promptText.toLowerCase();
    if (/(?:^|\b)(dialogue|conversation|banter|argue|talks?|says?|replies?|asks?|answers?)(?:\b|$)/.test(text)) return "dialogue_heavy";
    if (/(slow burn|longing|tension|pining|yearning|builds? slowly|waits?)(?:\b|$)/.test(text)) return "slow_burn";
    if (/(flirt|tease|charged|suggestive|chemistry|smolder|hints? at)(?:\b|$)/.test(text)) return "suggestive";
    if (/(heat|spicy|passion|kiss|bedroom|explicit|intimate|sensual)(?:\b|$)/.test(text)) return "explicit";
    return "balanced";
  }

  function suggestSceneStyle(promptText: string): Settings["sceneStyle"] {
    const text = promptText.toLowerCase();
    if (/(fight|chase|battle|escape|gun|sword|explosion|action|pursuit)(?:\b|$)/.test(text)) return "action_first";
    if (/(banter|witty|snark|back and forth|argument|conversation|dialogue)(?:\b|$)/.test(text)) return "fast_banter";
    if (/(lush|sensory|atmospheric|moody|immersive|beautiful prose|descriptive)(?:\b|$)/.test(text)) return "lush_prose";
    return "balanced";
  }

  const suggestedStartMode = suggestStartMode(state.prompt);
  const suggestedSceneStyle = suggestSceneStyle(state.prompt);
  const suggestedStartModeLabel =
    suggestedStartMode === "dialogue_heavy"
      ? "Dialogue-heavy"
      : suggestedStartMode === "slow_burn"
        ? "Slow burn"
        : suggestedStartMode === "suggestive"
          ? "Suggestive"
          : suggestedStartMode === "explicit"
            ? "Direct"
            : "Balanced";
  const suggestedSceneStyleLabel =
    suggestedSceneStyle === "lush_prose"
      ? "Lush prose"
      : suggestedSceneStyle === "fast_banter"
        ? "Fast banter"
        : suggestedSceneStyle === "action_first"
          ? "Action-first"
          : "Balanced";

  const filteredScratchpad = state.scratchpad.filter((item) => {
    const query = scratchpadSearch.trim().toLowerCase();
    if (!query) return true;
    const characterName = state.characters.find((character) => character.id === item.characterId)?.name ?? "";
    return [item.text, item.type, item.chapter ?? "", characterName].join(" ").toLowerCase().includes(query);
  });

  const commandItems = [
    { label: "Continue story", action: () => void generateStory() },
    { label: "Review for issues", action: () => void reviewStory() },
    { label: "Story summary", action: () => void summarizeStory() },
    { label: "Refresh character memory", action: () => void updateCharacterMemory() },
    { label: "Add character", action: addCharacter },
    { label: "Auto layout graph", action: autoLayout },
    { label: "Save scratchpad note", action: addScratchpadItem },
  ];

  async function updateCharacterMemory() {
    if (!state.settings.apiKey.trim()) {
      setPopup("Add an API key in Settings first.");
      return;
    }
    const result = await callApi("/api/memory", {
      provider: state.settings.provider,
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      story: state.story,
      character: selectedCharacter,
    });
    if (result.inconsistencies?.length) {
      setAnalysis({ inconsistencies: result.inconsistencies, typos: [] });
      setPendingCharacter(result.character);
      pushTimelineEntry("Character update pending", `${selectedCharacter.name} needs a continuity check.`);
      return;
    }
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => (c.id === prev.selectedCharacterId ? result.character : c)),
    }));
    pushTimelineEntry("Character memory refreshed", `${selectedCharacter.name} memory updated.`);
  }

  async function summarizeStory() {
    if (!state.settings.apiKey.trim()) {
      setPopup("Add an API key in Settings first.");
      return;
    }
    const result = await callApi("/api/review", {
      provider: state.settings.provider,
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      story: state.story,
      character: selectedCharacter,
    });
    const summary = result.summary || "No summary returned.";
    setStorySummary(summary);
    setState((prev) => ({ ...prev, review: summary }));
    pushTimelineEntry("Story summary", summary.slice(0, 180));
  }

  const isXaiGrok = state.settings.provider === "xai" && /grok/i.test(state.settings.model.trim());
  const spiceLabel = ["Gentle", "Suggestive", "Steamy", "Heat-forward", "Very spicy", "Absolute filth"][state.settings.spice - 1] ?? "Moderate";
  const contentModeLabel =
    state.settings.contentMode === "fade_to_black"
      ? "WI-safe / fade to black"
      : state.settings.contentMode === "closed_door"
        ? "Closed door / implied off-page"
        : state.settings.contentMode === "romance"
          ? "Romance / light intimacy"
          : state.settings.contentMode === "absolute_filth"
            ? "Absolute filth / xAI + Grok only"
            : "Spicy / still policy-safe";
  const contentModeHint =
    state.settings.contentMode === "fade_to_black"
      ? "No on-page explicitness; keep intimacy implied."
      : state.settings.contentMode === "closed_door"
        ? "Romance can happen, but the scene closes before details."
        : state.settings.contentMode === "romance"
          ? "Tender and flirty, but not explicit."
          : state.settings.contentMode === "absolute_filth"
            ? "Locked to xAI + Grok. It can be very hot, but still no illegal or non-consensual content."
            : "More heat, but still no illegal or non-consensual content.";
  const startModeLabel =
    state.settings.startMode === "balanced"
      ? "Balanced launch"
      : state.settings.startMode === "suggestive"
        ? "Suggestive / teasing opener"
        : state.settings.startMode === "explicit"
          ? "Direct / high-heat opener"
          : state.settings.startMode === "dialogue_heavy"
            ? "Dialogue-heavy opener"
            : "Slow-burn opener";
  const startModeHint =
    state.settings.startMode === "balanced"
      ? "A flexible default that keeps the prose even and natural."
      : state.settings.startMode === "suggestive"
        ? "A little more charged and flirtatious right from the first beat."
        : state.settings.startMode === "explicit"
          ? "More direct energy, while still respecting the selected content limits."
          : state.settings.startMode === "dialogue_heavy"
            ? "Start with character voices and momentum instead of long description."
          : "Stretch the tension out and let the attraction build slowly.";
  const sceneStyleLabel =
    state.settings.sceneStyle === "lush_prose"
      ? "Lush prose"
      : state.settings.sceneStyle === "fast_banter"
        ? "Fast banter"
        : state.settings.sceneStyle === "action_first"
          ? "Action-first"
          : "Balanced scene style";
  const sceneStyleHint =
    state.settings.sceneStyle === "lush_prose"
      ? "More atmosphere, imagery, and textured detail."
      : state.settings.sceneStyle === "fast_banter"
        ? "Tighter, quicker exchanges with a lot of voice."
        : state.settings.sceneStyle === "action_first"
          ? "Keep the momentum up and get to the motion fast."
          : "A flexible default that lets the scene breathe naturally.";

  return (
    <main className="shell">
      <section className="hero">
        <div className="panel hero-main">
          <div>
            <div className="eyebrow">Help Me Write</div>
            <h1 className="title">A writing assistant that stays in the room with the story.</h1>
            <p className="subtitle">
              Collaborate with AI, run a clean editing pass, and keep character continuity persistent so the cast does not
              mysteriously become new people halfway through chapter three.
            </p>
          </div>
          <div className="chips">
            <span className="chip">Local storage persistence</span>
            <span className="chip">OpenAI or Anthropic</span>
            <span className="chip">Character continuity alerts</span>
          </div>
        </div>
        <div className="panel hero-side">
          <div className="stat"><strong>{state.characters.length}</strong><span className="small">tracked characters</span></div>
          <div className="stat"><strong>{spiceLabel}</strong><span className="small">current spice setting</span></div>
          <div className="stat"><strong>{state.mode}</strong><span className="small">active workflow</span></div>
        </div>
      </section>

      <section className="grid">
        <div className="panel workspace">
          <div className="tabs">
            {(["collaborate", "edit"] as Mode[]).map((mode) => (
              <button key={mode} className={`tab ${state.mode === mode ? "active" : ""}`} onClick={() => setState((p) => ({ ...p, mode }))}>
                {mode === "collaborate" ? "Collaboration" : "Editor"}
              </button>
            ))}
            <span className="chip" title="Current story start mode">
              Start mode: {startModeLabel}
            </span>
            <button
              className="tab"
              onClick={() => setState((p) => ({ ...p, settings: { ...p.settings, startMode: suggestedStartMode } }))}
              title={`Suggested from the current prompt: ${suggestedStartModeLabel}`}
            >
              Use suggested start: {suggestedStartModeLabel}
            </button>
            <button className="tab primary" onClick={() => void generateStory()} disabled={isGenerating}>
              {isGenerating ? "Writing..." : state.mode === "collaborate" ? "Continue story" : "Apply edit pass"}
            </button>
            <button className="tab" onClick={() => void reviewStory()}>
              Review for issues
            </button>
            <button className="tab" onClick={() => void summarizeStory()}>
              Story summary
            </button>
            <button className="tab" onClick={() => void updateCharacterMemory()}>
              Refresh character memory
            </button>
            <button className="tab" onClick={exportProject}>Export</button>
            <button className="tab" onClick={exportMarkdown}>Export MD</button>
            <button className="tab" onClick={autoLayout}>Auto layout</button>
            <label className="tab" style={{ cursor: "pointer" }}>
              Import
              <input
                hidden
                type="file"
                accept="application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importProject(file);
                  e.currentTarget.value = "";
                }}
              />
              </label>
            <label className="tab" style={{ cursor: "pointer" }}>
              Import MD
              <input
                hidden
                type="file"
                accept=".md,text/markdown"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importMarkdown(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <button className="tab" onClick={addCharacter}>Add character</button>
          </div>

          <div className="section">
            <div className="field">
              <label>Story / draft</label>
              <textarea
                ref={storyRef}
                value={state.story}
                onChange={(e) => setState((p) => ({ ...p, story: e.target.value }))}
                onSelect={(e) => setStoryCursor(e.currentTarget.selectionStart ?? 0)}
                onClick={(e) => setStoryCursor(e.currentTarget.selectionStart ?? 0)}
              />
            </div>
            <div className="field">
              <label>{state.mode === "collaborate" ? "What should happen next?" : "What should be checked?"}</label>
              <textarea value={state.prompt} onChange={(e) => setState((p) => ({ ...p, prompt: e.target.value }))} />
              <div className="chips" style={{ marginTop: 8 }}>
                <span className="chip" title="Suggested start mode based on the prompt">
                  Suggested start: {suggestedStartModeLabel}
                </span>
                <span className="chip" title="Suggested scene style based on the prompt">
                  Suggested style: {suggestedSceneStyleLabel}
                </span>
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                {startModeHint} {sceneStyleHint}
              </div>
            </div>
            <div className="field">
              <label>Latest AI output</label>
              <div className="output">{streamText || state.lastGeneration || "Nothing yet."}</div>
            </div>
            <div className="field">
              <label>Markdown import preview</label>
              <div className="output">{markdownText ? markdownText.slice(0, 400) : "Import a Markdown file to review parsed content."}</div>
            </div>
            <div className="field">
              <label>Review notes</label>
              <div className="output">{state.review || "Run the review button to look for typos or continuity issues."}</div>
            </div>
          <div className="field">
            <label>Story summary</label>
            <div className="output">{storySummary || "Tap Story summary to get a quick recap of what has happened so far."}</div>
          </div>
          <div className="field">
            <label>Scratchpad</label>
            <textarea
              value={scratchpadText}
              onChange={(e) => setScratchpadText(e.target.value)}
              placeholder="Drop a half-baked idea here, then come back later when it is ready to matter."
            />
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field">
                <label>Type</label>
                <select value={scratchpadType} onChange={(e) => setScratchpadType(e.target.value)}>
                  <option value="idea">Idea</option>
                  <option value="line of dialogue">Line of dialogue</option>
                  <option value="plot twist">Plot twist</option>
                  <option value="character note">Character note</option>
                </select>
              </div>
              <div className="field">
                <label>Chapter</label>
                <input value={scratchpadChapter} onChange={(e) => setScratchpadChapter(e.target.value)} placeholder="Chapter 7" />
              </div>
              <div className="field">
                <label>Character</label>
                <select value={scratchpadCharacterId} onChange={(e) => setScratchpadCharacterId(e.target.value)}>
                  <option value="">Optional character</option>
                  {state.characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Promotion style</label>
              <select value={scratchpadInsertMode} onChange={(e) => setScratchpadInsertMode(e.target.value)}>
                <option value="prose">Prose</option>
                <option value="dialogue">Dialogue</option>
                <option value="bullet">Bullet</option>
              </select>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Search scratchpad</label>
              <input
                value={scratchpadSearch}
                onChange={(e) => setScratchpadSearch(e.target.value)}
                placeholder="Search ideas, types, chapters, or character names"
              />
            </div>
            <button onClick={addScratchpadItem} style={{ marginTop: 8 }}>Save idea</button>
            <div className="section" style={{ marginTop: 12 }}>
              {filteredScratchpad.length ? [...filteredScratchpad].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt).map((item) => {
                const linkedCharacter = state.characters.find((character) => character.id === item.characterId);
                return (
                  <div
                    key={item.id}
                    className="stat"
                    draggable
                    onDragStart={() => setDraggingScratchpadId(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggingScratchpadId) reorderScratchpad(draggingScratchpadId, item.id);
                      setDraggingScratchpadId(null);
                    }}
                    onDragEnd={() => setDraggingScratchpadId(null)}
                    style={{ cursor: "grab", borderColor: item.pinned ? typeColor(item.type) : undefined, boxShadow: item.pinned ? `0 0 0 1px ${typeColor(item.type)}55 inset` : undefined }}
                  >
                    <strong style={{ fontSize: 16, marginBottom: 0, color: typeColor(item.type) }}>{formatTimelineTime(item.createdAt)}</strong>
                    <div className="small">{item.text}</div>
                    <div className="chips" style={{ marginTop: 8 }}>
                      <span className="chip" style={{ color: typeColor(item.type) }}>{item.type}</span>
                      {item.chapter ? <span className="chip">{item.chapter}</span> : null}
                      {linkedCharacter ? <span className="chip">{linkedCharacter.name}</span> : null}
                      {item.pinned ? <span className="chip">Pinned</span> : null}
                    </div>
                    <div className="chips" style={{ marginTop: 8 }}>
                      <button onClick={() => promoteScratchpadItem(item.id)}>Promote to story</button>
                      <button onClick={() => toggleScratchpadPin(item.id)}>{item.pinned ? "Unpin" : "Pin"}</button>
                      <button onClick={() => removeScratchpadItem(item.id)}>Remove</button>
                    </div>
                  </div>
                );
              }) : <div className="small">No stray ideas yet. This is where the useful nonsense goes.</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="stack">
          <div className="panel" style={{ padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>Settings</h2>
            <div className="section">
              <div className="row">
                <div className="field">
                  <label>Provider</label>
                  <select
                    value={state.settings.provider}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        settings: {
                          ...p.settings,
                          provider: e.target.value as Provider,
                          contentMode:
                            e.target.value === "xai" && /grok/i.test(p.settings.model)
                              ? p.settings.contentMode
                              : p.settings.contentMode === "absolute_filth"
                                ? "spicy"
                                : p.settings.contentMode,
                          spice: e.target.value === "xai" ? p.settings.spice : Math.min(p.settings.spice, 5),
                        },
                      }))
                    }
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="xai">xAI</option>
                  </select>
                </div>
                <div className="field">
                  <label>Model</label>
                  <input
                    value={state.settings.model}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        settings: {
                          ...p.settings,
                          model: e.target.value,
                          contentMode:
                            p.settings.provider === "xai" && /grok/i.test(e.target.value)
                              ? p.settings.contentMode
                              : p.settings.contentMode === "absolute_filth"
                                ? "spicy"
                                : p.settings.contentMode,
                        },
                      }))
                    }
                  />
                  <div className="small" style={{ marginTop: 6 }}>
                    Try <code>grok-3-mini</code> for the cheapest xAI option, or a newer Grok if you want more capability. The extra spice tier only appears when xAI + Grok is selected.
                  </div>
                </div>
              </div>
              <div className="field">
                <label>API key</label>
                <input type="password" value={state.settings.apiKey} onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, apiKey: e.target.value } }))} placeholder="Stored locally in your browser" />
                <div className="small" style={{ marginTop: 6 }}>Saved only in this browser unless you export the project. No `.env` setup needed.</div>
                <button onClick={() => setState((p) => ({ ...p, settings: { ...p.settings, apiKey: "" } }))} style={{ marginTop: 8 }}>Clear saved key</button>
              </div>
              <div className="row">
                <div className="field">
                  <label>Writer name</label>
                  <input value={state.settings.writerName} onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, writerName: e.target.value } }))} />
                </div>
                <div className="field">
                  <label>Spice: {state.settings.spice}/{isXaiGrok ? 6 : 5}</label>
                  <input
                    className="spicy"
                    type="range"
                    min="1"
                    max={isXaiGrok ? 6 : 5}
                    value={Math.min(state.settings.spice, isXaiGrok ? 6 : 5)}
                    onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, spice: Number(e.target.value) } }))}
                  />
                  <div className="small" style={{ marginTop: 6 }}>
                    The 6th tier is exactly what it sounds like and is xAI-only. It will not appear for OpenAI or Anthropic.
                  </div>
                </div>
              </div>
              <div className="field">
                <label>Content mode</label>
                <select
                  value={state.settings.contentMode}
                  onChange={(e) =>
                    setState((p) => ({
                      ...p,
                      settings: {
                        ...p.settings,
                        contentMode:
                          e.target.value === "absolute_filth" && !(p.settings.provider === "xai" && /grok/i.test(p.settings.model))
                            ? "spicy"
                            : (e.target.value as Settings["contentMode"]),
                      },
                    }))
                  }
                >
                  <option value="fade_to_black">Fade to black - keep it implied</option>
                  <option value="closed_door">Closed door - romance off-page</option>
                  <option value="romance">Romance - tender, light intimacy</option>
                  <option value="spicy">Spicy - more heat, still safe</option>
                  {isXaiGrok ? <option value="absolute_filth">Absolute filth - xAI + Grok only</option> : null}
                </select>
                <div className="small" style={{ marginTop: 6 }}>
                  Use this to keep the tone where you want it, while the app still blocks illegal or non-consensual content.
                </div>
                <div className="chip" style={{ marginTop: 8 }}>
                  {contentModeLabel}
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  {contentModeHint}
                </div>
              </div>
              <div className="field">
                <label>Story start mode</label>
                <select
                  value={state.settings.startMode}
                  onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, startMode: e.target.value as Settings["startMode"] } }))}
                >
                  <option value="balanced">Balanced - steady, flexible launch</option>
                  <option value="suggestive">Suggestive - flirty and teasing</option>
                  <option value="explicit">Direct - more upfront heat, still policy-safe</option>
                  <option value="dialogue_heavy">Dialogue-heavy - lead with voices</option>
                  <option value="slow_burn">Slow burn - stretch the tension</option>
                </select>
                <div className="chip" style={{ marginTop: 8 }}>
                  {startModeLabel}
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  {startModeHint}
                </div>
              </div>
              <div className="field">
                <label>Scene style</label>
                <select
                  value={state.settings.sceneStyle}
                  onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, sceneStyle: e.target.value as Settings["sceneStyle"] } }))}
                >
                  <option value="balanced">Balanced - flexible and even</option>
                  <option value="lush_prose">Lush prose - sensory and atmospheric</option>
                  <option value="fast_banter">Fast banter - quick voices and rhythm</option>
                  <option value="action_first">Action-first - momentum before description</option>
                </select>
                <div className="chip" style={{ marginTop: 8 }}>
                  {sceneStyleLabel}
                </div>
                <div className="small" style={{ marginTop: 6 }}>
                  {sceneStyleHint}
                </div>
              </div>
              <div className="field">
                <label>Tone</label>
                <textarea value={state.settings.tone} onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, tone: e.target.value } }))} />
              </div>
              <div className="field">
                <label>House style</label>
                <textarea value={state.settings.houseStyle} onChange={(e) => setState((p) => ({ ...p, settings: { ...p.settings, houseStyle: e.target.value } }))} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>Character Builder</h2>
            <div className="field">
              <label>Current character</label>
              <select value={state.selectedCharacterId} onChange={(e) => setState((p) => ({ ...p, selectedCharacterId: e.target.value }))}>
                {state.characters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="row">
              <div className="field"><label>Name</label><input value={selectedCharacter.name} onChange={(e) => updateCharacter({ name: e.target.value })} /></div>
              <div className="field"><label>Role</label><input value={selectedCharacter.role} onChange={(e) => updateCharacter({ role: e.target.value })} /></div>
            </div>
            <div className="field"><label>Voice</label><input value={selectedCharacter.voice ?? ""} onChange={(e) => updateCharacter({ voice: e.target.value })} /></div>
            <div className="field"><label>Voice examples</label><textarea value={selectedCharacter.voiceExamples ?? ""} onChange={(e) => updateCharacter({ voiceExamples: e.target.value })} placeholder="Add a few lines that capture how this character sounds." /></div>
            <div className="field">
              <label>Voice samples</label>
              {(selectedCharacter.voiceSamples ?? []).map((sample, index) => (
                <textarea
                  key={index}
                  value={sample}
                  onChange={(e) =>
                    updateCharacter({
                      voiceSamples: (selectedCharacter.voiceSamples ?? []).map((item, sampleIndex) => (sampleIndex === index ? e.target.value : item)),
                    })
                  }
                  placeholder="A line that captures the character's texture."
                />
              ))}
              <button onClick={addVoiceSample}>Add voice sample</button>
            </div>
            <div className="field"><label>Appearance</label><input value={selectedCharacter.appearance ?? ""} onChange={(e) => updateCharacter({ appearance: e.target.value })} /></div>
            <div className="field"><label>Goals</label><input value={selectedCharacter.goals ?? ""} onChange={(e) => updateCharacter({ goals: e.target.value })} /></div>
            <div className="field"><label>Limits</label><input value={selectedCharacter.limits ?? ""} onChange={(e) => updateCharacter({ limits: e.target.value })} /></div>
            <div className="field"><label>Quirks</label><input value={selectedCharacter.quirks ?? ""} onChange={(e) => updateCharacter({ quirks: e.target.value })} /></div>
            <div className="field"><label>Relationships</label><input value={selectedCharacter.relationships ?? ""} onChange={(e) => updateCharacter({ relationships: e.target.value })} /></div>
            <div className="field">
              <label>Structured relationships</label>
              <div className="section">
                <div className="chips">
                  <button onClick={() => addPresetLink("sibling")}>Sibling</button>
                  <button onClick={() => addPresetLink("mentor")}>Mentor</button>
                  <button onClick={() => addPresetLink("rival")}>Rival</button>
                  <button onClick={() => addPresetLink("partner")}>Partner</button>
                  <button onClick={() => addPresetLink("friend")}>Friend</button>
                  <button onClick={() => addPresetLink("ex")}>Ex</button>
                </div>
                {(selectedCharacter.links ?? []).map((link, index) => (
                  <div key={index} className="row">
                    <input value={link.label} onChange={(e) => updateLink(index, { label: e.target.value })} placeholder="e.g. sibling, mentor, rival" />
                    <select value={link.targetId} onChange={(e) => updateLink(index, { targetId: e.target.value })}>
                      <option value="">Choose character</option>
                      {state.characters
                        .filter((character) => character.id !== selectedCharacter.id)
                        .map((character) => (
                          <option key={character.id} value={character.id}>
                            {character.name}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
                <button onClick={addLink}>Add relationship</button>
              </div>
            </div>
            <div className="field"><label>Backstory</label><textarea value={selectedCharacter.backstory ?? ""} onChange={(e) => updateCharacter({ backstory: e.target.value })} /></div>
            <div className="field"><label>Timeline notes</label><textarea value={selectedCharacter.timeline ?? ""} onChange={(e) => updateCharacter({ timeline: e.target.value })} /></div>
            <div className="field"><label>Secrets</label><textarea value={selectedCharacter.secrets ?? ""} onChange={(e) => updateCharacter({ secrets: e.target.value })} /></div>
            <div className="field"><label>Notes</label><textarea value={selectedCharacter.notes ?? ""} onChange={(e) => updateCharacter({ notes: e.target.value })} /></div>
            <div className="field"><label>Facts</label><textarea value={selectedCharacter.facts.join("\n")} onChange={(e) => updateCharacter({ facts: e.target.value.split("\n").filter(Boolean) })} /></div>
            <div className="field"><label>Per-character memory</label><textarea value={selectedCharacter.memory ?? ""} onChange={(e) => updateCharacter({ memory: e.target.value })} /></div>
          </div>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Character Graph</h2>
          <div className="small">Connections are inferred from relationship, backstory, timeline, and per-character memory text.</div>
          <div className="chips" style={{ marginTop: 10 }}>
            <span className="chip" style={{ color: "#f7b267" }}>Family</span>
            <span className="chip" style={{ color: "#8be9b2" }}>Mentor</span>
            <span className="chip" style={{ color: "#ff7c7c" }}>Rival</span>
            <span className="chip" style={{ color: "#ff9bd2" }}>Romance</span>
            <span className="chip" style={{ color: "#7aa7ff" }}>Friend</span>
            <span className="chip">Mentioned</span>
          </div>
          <svg
            viewBox="0 0 900 520"
            style={{ width: "100%", height: "auto", marginTop: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, background: "rgba(0,0,0,0.14)" }}
            onMouseMove={(e) => {
              if (!draggingNodeId) return;
              const svg = e.currentTarget;
              const rect = svg.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 900;
              const y = ((e.clientY - rect.top) / rect.height) * 520;
              moveNode(draggingNodeId, x, y);
            }}
            onMouseUp={() => setDraggingNodeId(null)}
            onMouseLeave={() => setDraggingNodeId(null)}
          >
            {graphEdges.map((edge, index) => {
              const from = nodeAt(edge.from.id);
              const to = nodeAt(edge.to.id);
              const fromX = from.x;
              const fromY = from.y;
              const toX = to.x;
              const toY = to.y;
              return (
                <g key={`${edge.from.id}-${edge.to.id}-${index}`}>
                  <line x1={fromX} y1={fromY} x2={toX} y2={toY} stroke={labelColor(edge.label)} strokeWidth="2" />
                  <text x={(fromX + toX) / 2} y={(fromY + toY) / 2 - 6} textAnchor="middle" fill={labelColor(edge.label)} fontSize="10">
                    {edge.label}
                  </text>
                </g>
              );
            })}
            {orderedNodes.map((character, index) => {
              const position = nodeAt(character.id);
              return (
                <g
                  key={character.id}
                  transform={`translate(${position.x}, ${position.y})`}
                  onMouseDown={() => setDraggingNodeId(character.id)}
                  style={{ cursor: "grab" }}
                >
                  <circle r="48" fill="rgba(123,167,255,0.18)" stroke={character.links?.length ? "#8be9b2" : "rgba(123,167,255,0.6)"} strokeWidth="2" />
                  <text y="-4" textAnchor="middle" fill="white" fontSize="14" fontWeight="700">{character.name}</text>
                  <text y="16" textAnchor="middle" fill="rgba(237,241,247,0.7)" fontSize="10">{character.role || "Character"}</text>
                </g>
              );
            })}
          </svg>
          <div className="section" style={{ marginTop: 12 }}>
            {state.characters.map((character) => (
              <div key={character.id} className="stat">
                <strong style={{ fontSize: 18, marginBottom: 0 }}>{character.name}</strong>
                <div className="small">{relationshipSummary(character) || "No inferred links yet."}</div>
                <div className="small" style={{ marginTop: 6 }}>{characterSnapshot(character) || "No voice snapshot yet."}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Continuity Timeline</h2>
          <div className="section">
            <div className="stat">
              <strong style={{ fontSize: 18, marginBottom: 0 }}>Latest summary</strong>
              <div className="small">{storySummary || "No summary yet."}</div>
            </div>
            <div className="stat">
              <strong style={{ fontSize: 18, marginBottom: 0 }}>Latest draft output</strong>
              <div className="small">{state.lastGeneration ? state.lastGeneration.slice(0, 220) : "Nothing generated yet."}</div>
            </div>
            <div className="stat">
              <strong style={{ fontSize: 18, marginBottom: 0 }}>Current review</strong>
              <div className="small">{state.review || "Run review to surface continuity issues."}</div>
            </div>
            <div className="stat">
              <strong style={{ fontSize: 18, marginBottom: 0 }}>Activity log</strong>
              <div className="section" style={{ marginTop: 10 }}>
                {timelineEntries.length ? (
                  timelineEntries.map((entry) => (
                    <div key={`${entry.at}-${entry.title}`} className="small">
                      <div style={{ fontWeight: 700, color: "white" }}>
                        {entry.title} <span style={{ color: "rgba(237,241,247,0.55)", fontWeight: 500 }}>{formatTimelineTime(entry.at)}</span>
                      </div>
                      <div>{entry.detail}</div>
                    </div>
                  ))
                ) : (
                  <div className="small">Run a summary, review, or generation pass to start the continuity log.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      {commandOpen ? (
        <div className="modalBackdrop" onClick={() => setCommandOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Command Palette</h3>
            <div className="small">Quick actions for keeping flow moving. Press Esc to close.</div>
            <div className="section" style={{ marginTop: 12 }}>
              {commandItems.map((item) => (
                <button key={item.label} className="tab" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => { item.action(); setCommandOpen(false); }}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      </section>

      {analysis ? (
        <section className="panel" style={{ padding: 18, marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Continuity check</h2>
          <div className="row">
            <div>
              <div className="small">Inconsistencies</div>
              <ul>
                {analysis.inconsistencies.length ? analysis.inconsistencies.map((item) => <li key={item}>{item}</li>) : <li>None found.</li>}
              </ul>
            </div>
            <div>
              <div className="small">Typos or cleanup notes</div>
              <ul>
                {analysis.typos.length ? analysis.typos.map((item) => <li key={item}>{item}</li>) : <li>None found.</li>}
              </ul>
            </div>
          </div>
          <div className="small">If the AI updates the character in a weird direction, let it surface here first so you can allow or correct it.</div>
        </section>
      ) : null}

      {pendingCharacter ? (
        <div className="modalBackdrop" onClick={() => setPendingCharacter(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Character inconsistency found</h3>
            <p>The assistant spotted a continuity change. Choose whether to accept the updated memory or keep the current sheet.</p>
            {analysis ? (
              <ul>
                {analysis.inconsistencies.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
            <div className="chips" style={{ marginTop: 16 }}>
              <button className="primary" onClick={() => {
                setState((prev) => ({
                  ...prev,
                  characters: prev.characters.map((c) => (c.id === prev.selectedCharacterId ? pendingCharacter : c)),
                }));
                setPendingCharacter(null);
              }}>
                Allow change
              </button>
              <button onClick={() => setPendingCharacter(null)}>Keep current</button>
            </div>
          </div>
        </div>
      ) : popup ? (
        <div className="modalBackdrop" onClick={() => setPopup(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Heads up</h3>
            <p>{popup}</p>
            <button className="primary" onClick={() => setPopup(null)}>Close</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
