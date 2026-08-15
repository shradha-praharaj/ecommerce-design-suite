# 🎮 Intelligent PC Builder Agent - Adaptive Expertise System

## Overview

Your PC builder agent has been upgraded with an **intelligent expertise detection system** that adapts the conversation flow based on the user's knowledge level. Instead of asking all users the same questions, the agent now personalizes the experience for:

- **🎯 EXPERTS**: Deep technical knowledge, want to choose specific CPU/GPU brands
- **⚙️ INTERMEDIATE**: Some technical knowledge, appreciate guided options with choices
- **👶 BEGINNERS**: No technical background, need outcome-focused guidance

---

## What Changed?

### 1. **New File: `pc-builder-expertise.ts`**

This module provides three core functions:

#### `detectPCBuilderExpertise(message, history?)`

Analyzes the user's message for technical signals:

```typescript
// EXPERT SIGNALS (detected from):
- Specific GPU models: RTX 5090, RTX 4090, RX 7900 XT, etc.
- CPU models: Ryzen 9 9950X, Core i9-14900K, etc.
- Motherboard specs: X870, Z890, B650E, etc.
- Technical terminology: bottleneck, VRM, overclock, IPC, thermal paste, etc.
- Memory timing awareness: DDR5 6400, CL30, latency, etc.

// INTERMEDIATE SIGNALS (detected from):
- Brand preferences without specific models: "I want AMD" or "NVIDIA is better"
- General performance awareness: "high-end", "mid-range", "1440p", "4K"
- Component category knowledge: mentions CPU, GPU, motherboard separately

// BEGINNER SIGNALS (detected from):
- Help-seeking language: "don't know", "no idea", "help me"
- Generic outcome focus: "best value", "good for gaming", "most popular"
- Secondhand information: "my friend said", "I heard"
```

**Returns:**

```typescript
{
  level: 'beginner' | 'intermediate' | 'expert',
  signals: string[],        // List of detected signals
  confidence: number,       // 0-1 confidence score
  technicalKeywords: []     // Technical terms found
}
```

#### `getNextFieldForExpertise(level, currentBrief)`

Returns adaptive questions based on expertise:

- **EXPERT**: CPU preference → GPU preference → Display target → Budget
- **INTERMEDIATE**: Workload → Budget → (optional) Display prefs
- **BEGINNER**: Workload → Usage Intensity → Budget _(current flow)_

#### `getAdaptiveFollowUpForExpertise(level)`

Returns context-aware follow-up chips:

```
EXPERT:     ["🔴 AMD Ryzen", "🔵 Intel Core", "🟢 Nvidia RTX", "🔴 AMD Radeon"]
INTERMEDIATE: ["🎮 Gaming", "📡 Streaming", "🎬 Video Editing", "💼 Workstation"]
BEGINNER:   ["🎮 Pure Gaming", "🎬 Video Editing", "📡 Streaming", "💼 Workstation"]
```

---

### 2. **Enhanced: `gaming-build-advisor-agent.ts`**

**Key Changes:**

#### Step 1: Expertise Detection

```typescript
const expertise = detectPCBuilderExpertise(message, history);
console.log(
  `Detected: ${expertise.level} (confidence: ${expertise.confidence.toFixed(2)})`,
);
```

#### Step 2: Adaptive Flow Routing

```typescript
if (expertise.level === 'expert') {
  // EXPERT FLOW: Ask CPU → GPU → Display → Budget
  // Skip "workload" and "usageIntensity" questions
  // Provide technical follow-ups
}

if (expertise.level === 'intermediate') {
  // INTERMEDIATE FLOW: Ask Workload → Budget → Display
  // Balance guidance with autonomy
}

if (expertise.level === 'beginner') {
  // BEGINNER FLOW: Ask Workload → Usage → Budget
  // Outcome-focused, no jargon
}
```

#### Step 3: Adaptive Presentation

```
EXPERT BUILD:        👨‍💻 Expert Build (technical details, swap options)
INTERMEDIATE BUILD:  ⚙️ Optimized Build (balanced explanations)
BEGINNER BUILD:      👶 Guided Build (simplified, outcome-focused)
```

---

## User Conversation Flows

### 📊 EXPERT Flow

**User:** "Help me build a gaming PC with Ryzen 9 and RTX 4090"

```
Agent: 🔧 CPU Preference? [AMD Ryzen | Intel Core | Your choice]
User: AMD Ryzen
Agent: 🎮 GPU Preference? [Nvidia RTX | AMD Radeon | Your choice]
User: Nvidia RTX
Agent: 🖥️ Target Display? [1080p 144Hz | 1440p 144Hz | 4K 60Hz | 4K 144Hz]
User: 4K 60Hz
Agent: 💰 Budget? [₹60,000 | ₹1,00,000 | ₹1,50,000 | ₹2,50,000+]
User: ₹2,00,000
Agent: 🏗️ BUILD: Shows expert-focused response with:
  - Technical specifications highlighted
  - Component swap options (GPU brand, CPU brand)
  - Power draw, compatibility notes
  - Advanced tuning options
```

### ⚙️ INTERMEDIATE Flow

**User:** "I want to build a PC for streaming and gaming with ₹1 lakh"

```
Agent: 🎯 Primary Use Case? [Gaming | Streaming | Video Editing | Workstation]
User: Streaming and Gaming
Agent: 💰 Budget? [₹60k | ₹1L | ₹1.5L | ₹2.5L+]
User: ₹1,00,000
Agent: 📺 Display Target? [1080p 144Hz | 1440p 144Hz | 4K 60Hz | Not sure]
User: 1440p 144Hz
Agent: ⚙️ BUILD: Shows optimized response with:
  - Balanced performance/cost explanation
  - Brand choice options
  - Practical upgrade paths
```

### 👶 BEGINNER Flow

**User:** "Help me pick a gaming PC, I have no idea about specs"

```
Agent: 🎯 What will they use it for? [Gaming | Video Editing | Streaming | Workstation]
User: Pure Gaming
Agent: ⏰ How much will they use it? [Occasional | Daily | Heavy Use]
User: Heavy use
Agent: 💰 Budget? [₹60k | ₹1L | ₹1.5L | ₹2.5L | ₹3L+]
User: ₹1,50,000
Agent: 👶 BUILD: Shows guided response with:
  - Simple explanations (no jargon)
  - "Why" for each component
  - Easy swap options
  - Clear follow-up actions
```

---

## Technical Implementation

### Expertise Detection Algorithm

**Scoring System:**

```
EXPERT THRESHOLD:
  - ≥3 expert signals → Expert (confidence 0.7-0.95)
  - 2 expert signals → Expert-leaning (confidence 0.65)

INTERMEDIATE THRESHOLD:
  - 1 expert + 3+ intermediate signals → Intermediate (confidence 0.7)
  - 4+ intermediate signals → Intermediate (confidence 0.75)
  - 1-2 intermediate with no expert → Intermediate (confidence 0.65)

BEGINNER THRESHOLD:
  - 2+ beginner signals + ≤2 intermediate → Beginner (confidence 0.8)
  - Default fallback → Beginner (confidence 0.5)
```

### Context-Aware Extraction

The system pairs user replies with assistant questions to avoid false positives:

```typescript
// BAD: "I want a 4090" could be GPU chip or model number
// GOOD: If assistant asked "GPU preference?", then "4090" = GPU choice

const precedingQuestion = findLastAssistantQuestion(history);
if (precedingQuestion.includes('gpu')) {
  cpuPreference = detectCpuPreference(userReply); // Skip if Q wasn't about CPU
}
```

---

## Adaptive Behaviors

### Follow-up Chips Change

**Expert sees:**

```
[Swap GPU to AMD] [Swap CPU to Intel] [Optimize for 4K] [Balance Power/Cost]
```

**Beginner sees:**

```
[Yes, add to cart] [Show cheaper] [Show faster] [Can I save?]
```

### Response Headers Change

```
EXPERT:       👨‍💻 Expert Build — ₹2,00,000
INTERMEDIATE: ⚙️ Optimized Build — ₹1,00,000
BEGINNER:     👶 Guided Build — ₹75,000
```

### Explanation Depth Changes

```
EXPERT:       "CPU brand locked to AMD per your request. GPU auto for compatibility."
INTERMEDIATE: "Balanced CPU/GPU selection for streaming + gaming workload."
BEGINNER:     "This CPU is fast at gaming. This GPU handles 1440p smoothly."
```

---

## Console Logging

The agent logs expertise detection for monitoring:

```
[GamingBuildAdvisor] Detected expertise: expert (confidence: 0.85) | Keywords: rtx 4090, bottleneck, overclock, thermal paste, curve optimizer
[GamingBuildAdvisor] Detected expertise: intermediate (confidence: 0.7) | Keywords: nvidia, 1440p, streaming
[GamingBuildAdvisor] Detected expertise: beginner (confidence: 0.8) | Keywords: don't know, help me
```

---

## Testing Scenarios

### Scenario 1: Expert User

```
User: "Help me build a gaming PC with Ryzen 7 9800X3D, RTX 4070 Ti, 4K monitor"

Expected:
✅ Skips workload/usage questions
✅ Asks for GPU brand confirmation
✅ Asks for display target (already has 4K hint)
✅ Asks for budget
✅ Shows expert-level technical details
✅ Offers component swaps
```

### Scenario 2: Intermediate User

```
User: "I want to stream while gaming. Budget is ₹1.5 lakh"

Expected:
✅ Asks for primary use case (streaming + gaming)
✅ Confirms budget (already stated)
✅ Asks for display preference
✅ Shows balanced component selection
✅ Offers straightforward upgrades
```

### Scenario 3: Beginner User

```
User: "My son wants a PC for gaming but I don't know what to buy"

Expected:
✅ Asks what he'll use it for
✅ Asks how often he'll use it
✅ Asks for budget
✅ Shows simple, jargon-free explanation
✅ Offers easy "upgrade" or "cheaper" options
```

---

## Files Modified

| File                            | Changes                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pc-builder-expertise.ts`       | **NEW** - Expertise detection engine                                                                          |
| `gaming-build-advisor-agent.ts` | Updated imports, added expertise detection to execute method, adaptive flow routing, context-aware follow-ups |

---

## Benefits

1. ✅ **Better UX**: Expert users aren't bored with basic questions
2. ✅ **Faster Builds**: Beginners skip confusing technical jargon
3. ✅ **Higher Confidence**: Intermediate users get tailored guidance
4. ✅ **Conversation Continuity**: History-based refinement of expertise level
5. ✅ **Maintainability**: Easy to add new expertise tiers or adjust thresholds

---

## Next Steps

### Optional Enhancements:

1. **Persist Expertise Profile**
   - Store detected expertise level in database
   - Refine over multiple conversations
   - Personalize recommendations beyond PC building

2. **A/B Testing**
   - Track conversion rate by expertise level
   - Measure build completion time
   - Identify flow drop-off points

3. **Expand to Other Agents**
   - Apply same pattern to mobile advisor, laptop advisor
   - Adapt for accessories/peripherals
   - Cross-product recommendations

4. **Machine Learning**
   - Train on past conversation logs
   - Improve keyword detection
   - Real-time expertise level refinement

---

## Troubleshooting

### Issue: User is misclassified as Expert

**Solution**: Expert detection requires ≥3 specific model mentions or technical terms. Avoid false positives by checking context in history.

### Issue: Intermediate users getting too many questions

**Solution**: Check that intermediate flow correctly skips "usageIntensity" field. It should ask: Workload → Budget → (optional) Display only.

### Issue: Build not adapting to expertise level

**Solution**: Verify that `expertise.level` is being returned correctly from `detectPCBuilderExpertise()`. Check console logs for detection output.

---

## Appendix: Keyword Reference

### GPU Models (Expert Detection)

`rtx 5090, rtx 5080, rtx 5070, rtx 4090, rtx 4080, rtx 4070, rx 7900 xtx, rx 7800 xt, arc b580`

### CPU Models (Expert Detection)

`ryzen 9 9950x, ryzen 7 9800x3d, core i9-14900k, core i7-14700k, threadripper`

### Technical Terms (Expert Detection)

`bottleneck, vrm, thermal paste, curve optimizer, ipc, tgp, chipset limitation, overclock, pbo`

### Beginner Indicators

`don't know, no idea, help me, confused, what should i buy`

### Component Types

`graphics card, gpu, processor, cpu, motherboard, ram, memory, storage, ssd, cooler, power supply, psu, case`
