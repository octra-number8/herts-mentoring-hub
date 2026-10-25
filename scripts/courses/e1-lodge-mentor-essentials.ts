import type { CourseDef } from "./types";

/**
 * Online companion to E1a Lodge Mentor Essentials (Issue 1 Draft, October 2026)
 * and the E1 Lodge Mentor Induction and Charge (Issue 1a Draft). Source text by the
 * Deputy Provincial Grand Mentor; adapted for self-paced learning.
 */
export const e1: CourseDef = {
  slug: "lodge-mentor-essentials",
  title: "Lodge Mentor Essentials",
  summary: "What the Lodge Mentor does, what to put in place in your first month, and what to do when it gets difficult. The online companion to the Lodge Mentor Essentials session and the Lodge Mentor Induction.",
  audiences: ["lodge_mentor"],
  stages: [],
  topics: ["lodge mentor", "role", "warning signs", "the charge"],
  level: "essential",
  principle: "prepare",
  minutes: 45,
  pathway: "lodge-mentor",
  passMark: 75,
  source: "E1a Lodge Mentor Essentials (Issue 1 Draft) and E1 Lodge Mentor Induction and Charge (Issue 1a Draft)",
  modules: [
    {
      title: "Why mentoring",
      summary: "The story behind the role, and the Hertfordshire answer.",
      lessons: [
        {
          title: "A man nobody noticed",
          kind: "content",
          minutes: 5,
          blocks: [
            { type: "text", markdown: "Every Lodge Mentor has a story of a good man lost because nobody noticed. Here is one, a composite drawn from real losses. Every detail has happened to someone.\n\n> I joined at thirty-four, proposed by a colleague I liked. My Initiation was extraordinary; I drove home buzzing. Then came my second meeting: nobody had told me it was mainly business, and I sat at dinner next to two men who talked across me all night about people I didn't know. At my first rehearsal evening I was told after ten minutes there was nothing for me and I should get off home. Work went mad that spring; I missed two meetings. Nobody rang. When I came back, someone at the bar said, 'Well, look who's remembered where we meet.' Everyone laughed. I laughed too. My subscription renewal came in January with a letter that read like a final demand. I paid it, and then I sat down one Sunday and wrote a different letter. The Secretary's reply was very polite. It said my resignation had been received and would be reported to the Lodge. Nobody ever asked me why." },
            { type: "callout", tone: "important", text: "None of the moments where this could have been turned around needed expertise. All of them needed someone noticing." },
            { type: "text", markdown: "## The Hertfordshire answer\n\nFreemasonry must be fun. A man who is enjoying himself attends; a man who attends participates; a man who participates belongs; and a man who belongs does not resign.\n\nRetention is the outcome of culture, never a target." },
          ],
        },
        {
          title: "The role: organiser, not everything",
          kind: "content",
          minutes: 6,
          blocks: [
            { type: "text", markdown: "## The role in one sentence\n\nThe Lodge Mentor makes sure mentoring happens; he does not do it all himself. He is an organiser and co-ordinator. Sharing the work across suitable, experienced Brethren makes it sustainable and more effective.\n\n## What the Lodge Mentor does\n\n- Assigns a Personal Mentor to every new member, chosen with care\n- Supports, encourages and thanks the Personal Mentors\n- Keeps simple records: one Personal Mentoring Plan per Brother\n- Is the Lodge's link with the Provincial Mentoring Team\n- Develops his successor from day one\n\nThe recommended tenure is three to five years." },
            { type: "text", markdown: "## Choosing a Personal Mentor\n\nTime, temperament and the potential for friendship, not seniority. Look for someone who knows the Lodge, listens patiently, will keep in touch between meetings, and can say \"I don't know, but I'll find out\".\n\nThe Proposer is often right because trust already exists, but not always: consider him first, never default to him. Past Masters make excellent Personal Mentors, and often need the purpose." },
            { type: "callout", tone: "tip", text: "Every Lodge has more possible Personal Mentors than it thinks. The next lesson asks you to prove it." },
          ],
        },
        {
          title: "Who in your Lodge could be a Personal Mentor?",
          kind: "reflection",
          minutes: 4,
          prompt: "List every member of your Lodge who could be a Personal Mentor. Think about time, temperament and friendship potential, not seniority, and include the Past Masters.",
          blocks: [
            { type: "text", markdown: "Take three minutes. Write down every name that comes to mind. The list is always longer than you expect.\n\nYour reflection is private to you. Bring the list to your next conversation with your Assistant Provincial Grand Mentor." },
          ],
        },
      ],
    },
    {
      title: "The principles and the journey",
      summary: "Prepare, Guide, Support, Enlighten, and the two times men are most likely to leave.",
      lessons: [
        {
          title: "Four principles, two windows",
          kind: "content",
          minutes: 6,
          blocks: [
            { type: "principles", intro: "Mentoring in Hertfordshire rests on four principles. They are not stages: they apply continuously and simultaneously throughout a member's journey." },
            { type: "text", markdown: "## The two windows\n\nMost losses fall within two years of Initiation, often before Raising. A second cluster falls in the year after the Chair.\n\nSpring Initiates are at extra risk, because the summer break interrupts their early participation. Plan deliberate summer contact for them." },
            { type: "callout", tone: "info", text: "There is no published national figure for the share of resignations in each window. The two windows rest on Provincial experience and the UGLE Members' Pathway papers." },
          ],
        },
        {
          title: "Your Lodge against the four principles",
          kind: "reflection",
          minutes: 5,
          prompt: "For each principle (Prepare, Guide, Support, Enlighten), write one thing your Lodge already does well and one thing it does not do at all.",
          blocks: [
            { type: "text", markdown: "Be honest about the second list. It becomes your action plan." },
          ],
        },
      ],
    },
    {
      title: "Your first month",
      summary: "Six things to put in place.",
      lessons: [
        {
          title: "Six things to put in place",
          kind: "content",
          minutes: 5,
          blocks: [
            { type: "text", markdown: "Whether you are newly appointed or have been in post a while, these six things are the foundation.\n\n1. **Your induction**, with the Charge and the Mentor's Jewel.\n2. **The list from the Secretary**: candidates, members in their first two years, and joining members in their first year.\n3. **A Personal Mentor and a Personal Mentoring Plan** for every man on that list.\n4. **Ten minutes each with the Secretary, the Almoner and the Worshipful Master.** Agree how you will see the attendance record, and that you will hear the same day if anyone resigns.\n5. **The monthly mentoring call**: first Tuesday, 7pm, on Teams.\n6. **Invite your Assistant Provincial Grand Mentor** to your Lodge's next Initiation." },
            { type: "callout", tone: "tip", text: "The Lodge Mentor's Short Guide, section 2, covers all six. Keep it to hand." },
          ],
        },
      ],
    },
    {
      title: "When it gets difficult",
      summary: "The signal, the four steps, and who else to involve.",
      lessons: [
        {
          title: "The pattern is the signal",
          kind: "content",
          minutes: 7,
          blocks: [
            { type: "text", markdown: "Risk shows as a break in a man's own pattern, not as a low level of attendance. One sign is nothing. A pattern is a conversation.\n\n## The two-misses, seven-days habit\n\nAfter two consecutive meetings missed without a word, someone rings within seven days of the second meeting. The tone is \"you were missed\", never \"why weren't you there\".\n\n## The four steps\n\n1. **The Personal Mentor**: friendly, informal contact.\n2. **The Lodge Mentor**: takes the overview, asks what the Lodge itself could change, keeps a discreet note, and closes the loop with the member.\n3. **The Worshipful Master**, with the Almoner alongside for anything touching welfare.\n4. **The Province**: an impartial voice, or a different Lodge where he might thrive.\n\nMost concerns end at step one and never look like a process." },
            { type: "text", markdown: "## The hand-offs\n\n- **The Almoner** for welfare: health, money, family or safety.\n- **The Secretary** acknowledges a resignation; he does not accept it. The member then has sixty days to withdraw it, so there is time for a conversation.\n- **The Treasurer**: arrears are an early signal. A first missed subscription earns a quiet word, not a letter that reads like a final demand.\n- **The Royal Arch Representative** for One Journey: information, not recruitment; timing, not inevitability." },
            { type: "text", markdown: "## Pressure in both directions\n\nThe member pushed too hard: office before he is ready, ritual beyond his ability, the Royal Arch before the time is right. And the member left under-stretched: a capable Brother waiting years for a first office, a Past Master with nothing to do, a joining member whose experience nobody thought to use.\n\nA Brother who is bored will leave as surely as one who is frightened. Raise the office queue with the Master and the Director of Ceremonies." },
            { type: "callout", tone: "important", text: "Escalation is a strength. Contact your Assistant Provincial Grand Mentor when a member is at significant risk, when welfare needs Provincial involvement, when your Lodge sees several resignations, when a member is relocating, or when you simply want a second opinion. All contact is in confidence." },
          ],
        },
        {
          title: "Scenario: the quiet drift",
          kind: "scenario",
          minutes: 6,
          blocks: [{ type: "text", markdown: "Work through what you would do. There is no score: each choice shows how it is likely to play out." }],
          scenario: {
            start: "s1",
            nodes: {
              s1: { text: "At the Committee, the Treasurer mentions that a Master Mason of three years has not paid his subscription. You realise he has also missed the last two meetings without apology. He was passed over for Inner Guard last year. What do you do first?", choices: [
                { label: "Ask his Personal Mentor, or the Brother who knows him best, to ring him within seven days.", next: "s2", feedback: "Step 1. A warm, informal call from a friend is how most concerns are resolved." },
                { label: "Ask the Secretary to write to him about the arrears.", next: "s1b", feedback: "A letter about money is likely to read like a final demand. The arrears are a signal to talk, not to chase." },
                { label: "Mention it at the bar so his friends can nudge him.", next: "s1c", feedback: "This turns a private matter into gossip. The Treasurer's signal goes to the Almoner and the Lodge Mentor, not round the bar." },
              ] },
              s1b: { text: "Three weeks later the Secretary forwards a short email: he wishes to resign. What now?", choices: [
                { label: "Remember the Secretary only acknowledges it. Use the sixty days: ask the best-placed Brother to call him, and involve the Almoner in case money is the real issue.", next: "s3", feedback: "Right. The sixty days exist so that someone has time to have the conversation." },
                { label: "Accept it; it was his decision.", next: "end_lost", feedback: "Nobody will ever know why he went, and the Lodge learns nothing." },
              ] },
              s1c: { text: "Word gets back to him that he was discussed at the bar. He stops answering messages. What now?", choices: [
                { label: "Ask his Personal Mentor to ring him personally, apologise for the clumsiness, and simply say he was missed.", next: "s2", feedback: "Recoverable, with a genuine personal call." },
              ] },
              s2: { text: "On the call he says work has been relentless, and adds, 'To be honest, I'm not sure the Lodge would notice if I wasn't there.' What do you take from that?", choices: [
                { label: "Under-use is a likely cause. Talk to the Master and the DC about a role for him, and keep in touch.", next: "s3", feedback: "Yes. He was passed over last year: a bored or overlooked Brother leaves as surely as an overwhelmed one." },
                { label: "Reassure him that everyone is busy and he'll get back into it.", next: "s2b", feedback: "Kind, but it misses what he told you about feeling unnoticed." },
              ] },
              s2b: { text: "He comes to one meeting, sits alone at dinner, and stops again. What should the Lodge Mentor do now?", choices: [
                { label: "Take the overview: ask what the Lodge could change, speak to the Master about a role and about who sits with him, and keep a discreet note.", next: "s3", feedback: "Step 2: the Lodge Mentor asks what the Lodge itself could change." },
              ] },
              s3: { text: "He agrees to come to the next meeting. The Master has asked him to help the DC lay out the Lodge, and his Personal Mentor will sit with him at dinner.", choices: [
                { label: "Close the loop: thank everyone involved and check in with him after the meeting.", next: "end", feedback: "Closing the loop with the member is part of Step 2." },
              ] },
              end_lost: { text: "He is gone, and nobody asked why. Go back to the start and try another route.", choices: [{ label: "Start again", next: "s1" }] },
              end: { text: "Most concerns end here, without ever looking like a process. Well done.", choices: [] },
            },
          },
        },
      ],
    },
    {
      title: "The Province behind you",
      summary: "Where to find help, a short check of the essentials, and the Charge.",
      lessons: [
        {
          title: "You do not hold this office alone",
          kind: "content",
          minutes: 4,
          blocks: [
            { type: "text", markdown: "- **Your Assistant Provincial Grand Mentor** for your area: your first call for advice.\n- **The monthly mentoring call**: first Tuesday of the month, 7pm, on Teams. Bring questions.\n- **DAWG**, the Daily Advancement WhatsApp Group, run by the Provincial Mentoring Team. Ask to be added.\n- **Training for your team**: the Lodge Mentor Induction, and the Personal Mentor course for your Personal Mentors.\n- **The mentoring library**: the Lodge Mentor's Guide, the Personal Mentor's Short Guide, the Mentor Meeting Guide, the Stage Checklists and the Warning Signs card.\n- **One-to-one help, in confidence**, from the Provincial Grand Mentor's office." },
            { type: "resource", title: "Solomon, UGLE's learning platform", url: "https://solomon.ugle.org.uk/", description: "Including the modules for mentors. Send your Personal Mentors there, and go yourself." },
          ],
        },
        {
          title: "Check your understanding",
          kind: "quiz",
          minutes: 5,
          isAssessment: true,
          maxAttempts: 3,
          blocks: [{ type: "text", markdown: "Six short questions on the essentials. You need 75% to pass, and you can try again." }],
          questions: [
            { kind: "single", prompt: "Which sentence best describes the Lodge Mentor's role?", options: ["He mentors every new member himself.", "He makes sure mentoring happens; he does not do it all himself.", "He reports on members' attendance to the Province.", "He coaches the ritual for new members."], correct: [1],
              feedbackCorrect: "Yes: an organiser and co-ordinator.", feedbackIncorrect: "The Lodge Mentor makes sure mentoring happens; he does not do it all himself." },
            { kind: "multiple", prompt: "What matters most when choosing a Personal Mentor? Choose all that apply.", options: ["Time", "Temperament", "Potential for friendship", "Seniority"], correct: [0, 1, 2],
              feedbackCorrect: "Right: time, temperament and friendship potential, never seniority.", feedbackIncorrect: "Time, temperament and the potential for friendship. Seniority is not the test." },
            { kind: "single", prompt: "When are men most likely to leave?", options: ["In the first two years, and in the year after the Chair", "Only after Raising", "In the year as Senior Warden", "Evenly across their membership"], correct: [0],
              feedbackCorrect: "Correct: the two windows.", feedbackIncorrect: "The two recognised windows are the first two years and the year after the Chair." },
            { kind: "single", prompt: "A Brother misses two consecutive meetings without a word. What is the habit?", options: ["Wait for Hermes to notify the Almoner", "Someone rings him within seven days of the second meeting", "The Secretary writes to him", "Raise it at the next Committee"], correct: [1],
              feedbackCorrect: "Yes: two misses, seven days.", feedbackIncorrect: "The habit is a call within seven days of the second missed meeting. Waiting for a notification loses a month." },
            { kind: "true_false", prompt: "The Secretary can accept a resignation on the Lodge's behalf.", options: ["True", "False"], correct: [1],
              feedbackCorrect: "Right. He acknowledges receipt only, and the member then has sixty days to withdraw it.", feedbackIncorrect: "False. The Secretary acknowledges receipt only; the member has sixty days to withdraw it." },
            { kind: "single", prompt: "A mentee tells his Personal Mentor about money worries at home. Who should be involved promptly?", options: ["Nobody: it is private", "The Treasurer", "The Lodge Almoner and the Lodge Mentor", "The Royal Arch Representative"], correct: [2],
              feedbackCorrect: "Correct. Welfare belongs with the Almoner; referring early is the skill, not the failure.", feedbackIncorrect: "Welfare matters go to the Lodge Almoner and the Lodge Mentor, promptly and in confidence." },
          ],
        },
        {
          title: "The Charge to the newly appointed Lodge Mentor",
          kind: "content",
          minutes: 4,
          blocks: [
            { type: "callout", tone: "info", text: "Presented in writing to every new Lodge Mentor on appointment. It complements, and never replaces, the presentation of the Mentor's Jewel in open Lodge." },
            { type: "text", markdown: "Brother, the office you have accepted is unlike any other in the Lodge. The Treasurer keeps the accounts and the Secretary keeps the record; you keep something less visible and more easily lost: the experience of every member, from the man who has not yet been Initiated to the Past Master wondering what his Freemasonry is now for.\n\nYour duty is not to mentor every member yourself. It is to make sure that every member is mentored: that each new Brother has a Personal Mentor chosen with care; that those mentors are supported, encouraged and thanked; that no one's absence goes unnoticed and no one's question goes unasked; and that the Brethren of your Lodge come to understand that mentoring is not an office but a culture. We are all mentors to others in Freemasonry.\n\nFour words describe the work: Prepare, Guide, Support, Enlighten. Prepare every member for what lies ahead of him, so that there are never any surprises. Guide him with accurate and honest information, so that he navigates an unfamiliar world with confidence. Support him through whatever life and the Lodge may bring, asking always \"How can we help?\" and never \"Why weren't you there?\" And enlighten him, patiently, at his pace, following his curiosity and not your own, so that Freemasonry becomes to him not information learned but a life enjoyed and understood.\n\nRemember the order of things: his family first, his work second, his Masonry third. Hold that line for him even when the Lodge's programme tempts otherwise, and you will keep men the calendar would have lost.\n\nYou do not hold this office alone. Behind you stand the mentors of every Lodge in this Province, the Provincial Mentoring Team, and guidance for every stage of the road. Ask for help early and often; in Hertfordshire, asking is a strength.\n\nAnd from your first day, look for the Brother who will one day succeed you, for the measure of your work is not what mentoring looks like in your Lodge during your tenure, but what it looks like after it.\n\nMay the work be patient and purposeful, and may Freemasonry flourish, root and branch.\n\n*Presented on behalf of the Provincial Grand Mentor, Province of Hertfordshire.*" },
          ],
        },
        {
          title: "My one action",
          kind: "reflection",
          minutes: 3,
          prompt: "Write the one action you will take for your Lodge, by when, and who else needs to know.",
          blocks: [{ type: "text", markdown: "Keep it to one thing you will actually do. Your Assistant Provincial Grand Mentor will ask you about it within the month." }],
        },
      ],
    },
  ],
};
