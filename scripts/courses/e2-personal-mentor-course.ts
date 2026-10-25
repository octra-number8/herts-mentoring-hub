import type { CourseDef } from "./types";

/**
 * Online companion to E2a Personal Mentor Course (Facilitator Guide and Workbook,
 * Issue 1 Draft, October 2026), which supersedes the E2 Personal Mentor Workshop.
 * Adapted for self-paced learning; the in-person course remains the main event.
 */
export const e2: CourseDef = {
  slug: "personal-mentor-course",
  title: "Personal Mentor Course",
  summary: "Questions that open doors, listening properly, spotting trouble early, and knowing where your role ends. The online companion to the Province's Personal Mentor course.",
  audiences: ["personal_mentor", "lodge_mentor"],
  stages: [],
  topics: ["personal mentor", "conversation", "listening", "warning signs"],
  level: "essential",
  principle: "support",
  minutes: 50,
  pathway: "personal-mentor",
  passMark: 75,
  source: "E2a Personal Mentor Course Facilitator Guide and Workbook (Issue 1 Draft)",
  modules: [
    {
      title: "The story of a man we lost",
      summary: "A composite drawn from real losses.",
      lessons: [
        {
          title: "Read the story",
          kind: "content",
          minutes: 4,
          blocks: [
            { type: "text", markdown: "Read this slowly. It is a composite drawn from real losses, and every detail has happened to someone.\n\n> I joined at thirty-four, proposed by a colleague I liked. My Initiation was extraordinary; I drove home buzzing. Then came my second meeting: nobody had told me it was mainly business, and I sat at dinner next to two men who talked across me all night about people I didn't know. At my first rehearsal evening I was told after ten minutes there was nothing for me and I should get off home. Work went mad that spring; I missed two meetings. Nobody rang. When I came back, someone at the bar said, 'Well, look who's remembered where we meet.' Everyone laughed. I laughed too. My subscription renewal came in January with a letter that read like a final demand. I paid it, and then I sat down one Sunday and wrote a different letter. The Secretary's reply was very polite. It said my resignation had been received and would be reported to the Lodge. Nobody ever asked me why." },
          ],
        },
        {
          title: "Where could it have been turned around?",
          kind: "reflection",
          minutes: 4,
          prompt: "List every moment in the story where someone could have changed the outcome. There are at least six.",
          blocks: [{ type: "text", markdown: "Write your list before you move on. The next lesson shows the moments others have found." }],
        },
        {
          title: "What we can learn",
          kind: "content",
          minutes: 3,
          blocks: [
            { type: "text", markdown: "Moments where it could have been turned around:\n\n1. Nobody told him the second meeting would be mostly business.\n2. Nobody sat with him at dinner or brought him into the conversation.\n3. He was sent home from the rehearsal instead of being given something to do.\n4. He missed two meetings and nobody rang.\n5. The joke at the bar greeted his return with ridicule rather than welcome.\n6. The subscription letter read like a final demand, not a quiet word.\n7. His resignation was acknowledged, and nobody asked why in the sixty days he had to reconsider." },
            { type: "callout", tone: "important", text: "None of these required expertise. All of them required someone noticing. A Personal Mentor is a friend with a purpose." },
          ],
        },
      ],
    },
    {
      title: "What the role is, and is not",
      summary: "A friend with a purpose, and the boundaries that free you.",
      lessons: [
        {
          title: "A friend with a purpose",
          kind: "content",
          minutes: 5,
          blocks: [
            { type: "text", markdown: "A Personal Mentor is a friend with a purpose. Not an expert, not a teacher, not a ritualist: the person a new Brother can ring, message or sit next to without feeling he is bothering anyone.\n\n| Your role is | Your role is not |\n|---|---|\n| His first point of contact for any question | The only person who can help him |\n| Someone who keeps in touch between meetings | A ritual coach; that is the Lodge of Instruction |\n| A listener who notices when something changes | Someone who monitors or reports on him |\n| His bridge to the Lodge and the Province | A replacement for the Lodge Mentor, who co-ordinates |" },
            { type: "principles", intro: "The four principles run together, all the time. They are not stages." },
            { type: "callout", tone: "important", text: "Coach, not counsellor. If he tells you something that touches his health, money, family or safety, speak to the Lodge Almoner and the Lodge Mentor promptly. You are not expected to carry it alone. Referring early is the skill, not the failure." },
          ],
        },
      ],
    },
    {
      title: "Questions that open doors",
      summary: "Open questions invite the truth.",
      lessons: [
        {
          title: "Open and closed questions",
          kind: "content",
          minutes: 4,
          blocks: [
            { type: "text", markdown: "\"Did you enjoy the ceremony?\" invites \"yes\". \"What did you make of tonight?\" invites the truth.\n\nThe test of an open question is that you cannot predict the answer. Most mentors ask closed questions out of kindness, to make it easy to answer. The kindness is in the open question, because it says: I want to know what you actually think." },
            { type: "callout", tone: "tip", text: "Try it this week: ask a Brother, \"What did you make of your own Initiation, all those years ago?\" Then listen." },
          ],
        },
        {
          title: "Rewrite the closed question",
          kind: "quiz",
          minutes: 5,
          isAssessment: false,
          maxAttempts: 5,
          passMark: 50,
          blocks: [{ type: "text", markdown: "For each closed question, choose the best open version. This is practice: try as often as you like." }],
          questions: [
            { kind: "single", prompt: "\"Did you enjoy the ceremony?\"", options: ["What did you make of tonight?", "Did you enjoy it as much as you expected?", "Was it good?"], correct: [0], feedbackCorrect: "You cannot predict the answer.", feedbackIncorrect: "That still invites yes or no. Try: \"What did you make of tonight?\"" },
            { kind: "single", prompt: "\"Are you settling in alright?\"", options: ["Are you finding it OK?", "What has surprised you most so far?", "Do you feel settled now?"], correct: [1], feedbackCorrect: "Good: it invites a story.", feedbackIncorrect: "Try: \"What has surprised you most so far?\"" },
            { kind: "single", prompt: "\"Have you got any questions?\"", options: ["Any questions at all?", "What have you been wondering about that nobody has explained?", "Is everything clear?"], correct: [1], feedbackCorrect: "Yes: it gives him permission to ask.", feedbackIncorrect: "Try: \"What have you been wondering about that nobody has explained?\"" },
            { kind: "single", prompt: "\"Are you coming to the next meeting?\"", options: ["What would make the next few months work well for you?", "We'll see you next time, won't we?", "Can you make the next one?"], correct: [0], feedbackCorrect: "It opens a conversation rather than asking for a promise.", feedbackIncorrect: "Try: \"What would make the next few months work well for you?\"" },
            { kind: "single", prompt: "\"Is the ritual learning going okay?\"", options: ["Have you learned your piece yet?", "How are you finding the learning, and what would help?", "Is it going well?"], correct: [1], feedbackCorrect: "Right: it asks and offers help.", feedbackIncorrect: "Try: \"How are you finding the learning, and what would help?\"" },
            { kind: "single", prompt: "\"Everything alright at home?\"", options: ["All good at home?", "How are things generally, with work and home, and how does Lodge fit around it all at the moment?", "No problems at home, then?"], correct: [1], feedbackCorrect: "Yes, and it keeps Family, Work, Masonry in the right order.", feedbackIncorrect: "Try: \"How are things generally, with work and home, and how does Lodge fit around it all at the moment?\"" },
          ],
        },
      ],
    },
    {
      title: "Listening, and the three-second rule",
      summary: "What he says after the silence is usually the real answer.",
      lessons: [
        {
          title: "The three-second rule",
          kind: "content",
          minutes: 4,
          blocks: [
            { type: "text", markdown: "When silence falls, count to three before you speak. He will usually fill it, and what he says then is the real answer.\n\nMost of us fill silence within a second because it feels awkward. The awkwardness is yours, not his; he is thinking.\n\nListen for tone, hesitation, what he returns to, and what he does not say." },
          ],
        },
        {
          title: "Try it",
          kind: "reflection",
          minutes: 4,
          prompt: "Have a conversation this week in which you only ask questions and count to three after each pause. What did you hear that you would otherwise have missed?",
          blocks: [{ type: "text", markdown: "Come back and write what happened. It is private to you." }],
        },
      ],
    },
    {
      title: "Scenarios",
      summary: "Four situations every Personal Mentor meets.",
      lessons: [
        {
          title: "Scenario A: the overwhelmed Entered Apprentice",
          kind: "scenario",
          minutes: 4,
          blocks: [],
          scenario: {
            start: "a1",
            nodes: {
              a1: { text: "Your mentee, initiated two months ago, says at the Festive Board: \"Honestly, I still haven't a clue what's going on in there. Everyone else seems to just know.\" He is smiling, but he has said it twice now. What do you do tonight?", choices: [
                { label: "Normalise it: everyone felt this. Tell him the two shocks are the unfamiliar sights and the unfamiliar language.", next: "a2", feedback: "Reassurance before information." },
                { label: "Explain the whole ceremony to him there and then.", next: "a1b", feedback: "Too much at once, and not the place. Pace the information." },
              ] },
              a1b: { text: "His eyes glaze over and a neighbour joins in with a different explanation. He looks more lost than before.", choices: [{ label: "Stop, reassure him that this is normal, and suggest you meet properly before the next meeting.", next: "a2" }] },
              a2: { text: "He looks relieved. What do you do this week?", choices: [
                { label: "Book a one-to-one before the next meeting, and look at the Initiate's Guide and Welcome Apprentice on Solomon together.", next: "a3", feedback: "Yes: together, at his pace." },
                { label: "Send him a long reading list.", next: "a2b", feedback: "Information without company rarely helps at this stage." },
              ] },
              a2b: { text: "He says thanks, but you suspect he will not read it.", choices: [{ label: "Offer to go through the first part with him over a coffee.", next: "a3" }] },
              a3: { text: "This month, keep in touch between meetings and let his curiosity set the pace. Most new Brethren feel exactly as he did.", choices: [] },
            },
          },
        },
        {
          title: "Scenario B: the quiet drift",
          kind: "scenario",
          minutes: 4,
          blocks: [],
          scenario: {
            start: "b1",
            nodes: {
              b1: { text: "A Master Mason of three years, not your mentee but a man you know, has missed two consecutive meetings without apology. The Treasurer mentions his subscription is unpaid. He was passed over for Inner Guard last year. Who acts first?", choices: [
                { label: "His Personal Mentor, or the best-placed friend (perhaps you), rings within seven days.", next: "b2", feedback: "Step 1 of the four steps." },
                { label: "The Treasurer writes about the arrears.", next: "b1b", feedback: "The Treasurer's signal goes to the Almoner and the Lodge Mentor, not straight to a letter." },
              ] },
              b1b: { text: "A formal letter is the last thing a drifting man needs. Who should hear the Treasurer's signal?", choices: [{ label: "The Almoner and the Lodge Mentor, quietly.", next: "b2" }] },
              b2: { text: "You ring him. How do you open?", choices: [
                { label: "\"You were missed. How are things?\"", next: "b3", feedback: "Welfare tone: you were missed." },
                { label: "\"Why weren't you there?\"", next: "b2b", feedback: "That sounds like an accusation. It is \"How can we help?\", never \"Why weren't you there?\"" },
              ] },
              b2b: { text: "He sounds defensive and the call ends quickly.", choices: [{ label: "Try again a few days later: say he was missed, and ask how things are.", next: "b3" }] },
              b3: { text: "He mentions he isn't sure anyone would notice if he stopped. Being passed over may matter more than he lets on. You pass that to the Lodge Mentor, who can raise the office queue with the Master and the DC. Most concerns end at this step.", choices: [] },
            },
          },
        },
        {
          title: "Scenario C: the ritual dread",
          kind: "scenario",
          minutes: 4,
          blocks: [],
          scenario: {
            start: "c1",
            nodes: {
              c1: { text: "Your mentee has been offered his first office. He tells you privately he barely slept before his Second Degree questions and is thinking of saying no: \"I'm just not a performer, and I think they'll think less of me.\" What do you say?", choices: [
                { label: "His contribution is valid with or without ritual. Explore what 'ready' would need: the Lodge of Instruction, a small first piece, a shared office.", next: "c2", feedback: "Protect him from pressure in both directions." },
                { label: "Tell him everyone gets nervous and he should just accept.", next: "c1b", feedback: "That pushes him before he is ready." },
                { label: "Tell him to turn it down and not worry about office at all.", next: "c1c", feedback: "That risks leaving a capable man waiting. Explore what would help first." },
              ] },
              c1b: { text: "He accepts reluctantly and dreads every meeting. Is there a better way?", choices: [{ label: "Go back and explore what would make him ready.", next: "c1" }] },
              c1c: { text: "He is relieved, but in two years he may be the capable Brother left waiting. Is there a better way?", choices: [{ label: "Go back and explore what would make him ready.", next: "c1" }] },
              c2: { text: "Who else needs to know?", choices: [{ label: "The Lodge Mentor, so the DC and the Master know where he is, and so he is not left waiting either.", next: "c3" }] },
              c3: { text: "Good mentoring here works in both directions: no office before he is ready, and no capable man left waiting.", choices: [] },
            },
          },
        },
        {
          title: "Scenario D: the eager recruiter",
          kind: "scenario",
          minutes: 4,
          blocks: [],
          scenario: {
            start: "d1",
            nodes: {
              d1: { text: "At the bar, a well-meaning senior Brother is pressing your recently raised mentee about joining the Chapter: \"You're not a proper Mason till you've done it, you know. I'll put your name down.\" Your mentee looks cornered. What do you do in the moment?", choices: [
                { label: "Rescue him with grace: a change of subject, a drink to fetch, a Brother he must meet.", next: "d2", feedback: "Never embarrass the senior Brother publicly." },
                { label: "Tell the senior Brother, in front of everyone, that he is out of order.", next: "d1b", feedback: "Rescue your mentee without embarrassing anyone." },
              ] },
              d1b: { text: "The atmosphere turns awkward, and your mentee is more uncomfortable than before.", choices: [{ label: "Try a graceful rescue instead.", next: "d1" }] },
              d2: { text: "Afterwards, what do you tell your mentee?", choices: [
                { label: "Information, not recruitment: the decision and its timing are his alone. The Royal Arch Representative is the person to talk to when he is ready.", next: "d3", feedback: "Timing, not inevitability." },
              ] },
              d3: { text: "If it happens again, a quiet word via the Lodge Mentor. The Royal Arch is the completion of Pure Antient Masonry, offered as information, never as pressure.", choices: [] },
            },
          },
        },
      ],
    },
    {
      title: "Warning signs and the four steps",
      summary: "A pattern is a conversation.",
      lessons: [
        {
          title: "The warning signs",
          kind: "content",
          minutes: 5,
          blocks: [
            { type: "text", markdown: "Risk shows as a break in his own pattern, not as a low level of attendance. One sign is nothing. A pattern is a conversation.\n\n- **Attendance:** two or more consecutive meetings missed without a word; attending only Installations or socials; a summer absence that runs into autumn.\n- **Participation:** reluctance to accept work or office; withdrawal from conversation; missing the Lodge of Instruction while holding office; visible unhappiness.\n- **Communication:** unanswered calls and messages; expressed frustration; repeated talk of time or money pressure; subscription arrears.\n\n## The four steps\n\n1. **You.** Friendly, informal contact after any unexpected absence; after two consecutive misses, within seven days of the second meeting.\n2. **The Lodge Mentor.** Takes the overview, asks what the Lodge itself could change, keeps a discreet note, and closes the loop with the member.\n3. **The Worshipful Master**, with the Almoner alongside for anything touching welfare.\n4. **The Province.** An impartial voice, or a different Lodge where he might thrive. Referral is responsible mentoring, not failure." },
            { type: "callout", tone: "important", text: "The right question is always \"How can I help?\", never \"Why haven't you been attending?\"" },
          ],
        },
        {
          title: "Check your understanding",
          kind: "quiz",
          minutes: 4,
          isAssessment: true,
          maxAttempts: 3,
          blocks: [{ type: "text", markdown: "Five questions. You need 75% to pass, and you can try again." }],
          questions: [
            { kind: "single", prompt: "Which best describes a Personal Mentor?", options: ["An expert in ritual", "A friend with a purpose", "The Lodge's welfare officer", "Someone who reports on the new member"], correct: [1], feedbackCorrect: "Yes.", feedbackIncorrect: "A Personal Mentor is a friend with a purpose." },
            { kind: "true_false", prompt: "A single missed meeting is a warning sign that needs escalating.", options: ["True", "False"], correct: [1], feedbackCorrect: "Right: one sign is nothing; a pattern is a conversation.", feedbackIncorrect: "One sign is nothing. A break in his own pattern is what matters." },
            { kind: "single", prompt: "What is the second of the four steps?", options: ["The Province", "The Worshipful Master", "The Lodge Mentor", "The Treasurer"], correct: [2], feedbackCorrect: "Correct.", feedbackIncorrect: "Personal Mentor, then the Lodge Mentor, then the Master with the Almoner, then the Province." },
            { kind: "single", prompt: "Your mentee mentions serious money worries. What do you do?", options: ["Keep it to yourself", "Speak to the Lodge Almoner and the Lodge Mentor promptly", "Lend him the money", "Tell the Treasurer to waive his subscription"], correct: [1], feedbackCorrect: "Coach, not counsellor.", feedbackIncorrect: "Welfare belongs with the Almoner. Referring early is the skill, not the failure." },
            { kind: "multiple", prompt: "Which are part of a Personal Mentor's role? Choose all that apply.", options: ["Keeping in touch between meetings", "Coaching his ritual", "Noticing when something changes", "Being his bridge to the Lodge"], correct: [0, 2, 3], feedbackCorrect: "Right. Ritual coaching belongs to the Lodge of Instruction.", feedbackIncorrect: "Ritual coaching is the Lodge of Instruction's job, not the Personal Mentor's." },
          ],
        },
      ],
    },
    {
      title: "Your tools and your commitment",
      summary: "Where everything lives, and one thing you will do differently.",
      lessons: [
        {
          title: "The tools, and where they live",
          kind: "content",
          minutes: 3,
          blocks: [
            { type: "text", markdown: "- **Personal Mentor's Short Guide**: the role, the journey at a glance, the conversations that matter. Read it on the train.\n- **Mentor Meeting Guide**: a conversation guide for one-to-one meetings, stage by stage. Reach for it before each one-to-one.\n- **Stage Checklists**: one page each for Initiation night, the second meeting, before Passing and Raising, Installation and first Lodge of Instruction.\n- **Warning Signs card**: the signs and the four steps, for your pocket.\n- **The monthly mentoring call**: first Tuesday of the month, 7pm, on Teams.\n- **DAWG**, the Daily Advancement WhatsApp Group, run by the Provincial Mentoring Team. Ask to be added." },
            { type: "resource", title: "Solomon, UGLE's learning platform", url: "https://solomon.ugle.org.uk/", description: "Send your mentee there, and go yourself." },
          ],
        },
        {
          title: "My commitment",
          kind: "reflection",
          minutes: 3,
          prompt: "One thing I will do differently with my mentee this month, by when, and how I will know it worked.",
          blocks: [{ type: "text", markdown: "Family, Work, Masonry: in that order, always. Freemasonry must be fun. A man who is enjoying himself attends; a man who attends participates; a man who participates belongs; and a man who belongs does not resign. That is the whole job." }],
        },
      ],
    },
  ],
};
