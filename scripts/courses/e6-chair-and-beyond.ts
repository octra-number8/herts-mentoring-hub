import type { CourseDef } from "./types";

/**
 * Online companion to E6a The Chair and Beyond (Facilitator Guide, Action Sheet and
 * Pocket Card, Issue 1 Draft, October 2026). For Wardens, Masters Elect and Masters.
 * Facts are as sourced in the facilitator guide (Secretaries' Handbook 2026, DC Guide
 * 2025, UGLE Members' Pathway papers, Solomon); verify currency at each issue.
 */
export const e6: CourseDef = {
  slug: "the-chair-and-beyond",
  title: "The Chair and Beyond",
  summary: "For Wardens, Masters Elect and Masters: the things about the year in the Chair that are not in the ritual book, seen through the eyes of the newest man in the room, and the year after.",
  audiences: ["all"],
  stages: ["established"],
  topics: ["master", "wardens", "past masters", "office", "lodge culture"],
  level: "recommended",
  principle: "guide",
  minutes: 45,
  pathway: "wardens-and-masters",
  passMark: 70,
  source: "E6a The Chair and Beyond Facilitator Guide, Action Sheet and Pocket Card (Issue 1 Draft)",
  modules: [
    {
      title: "Why you",
      summary: "The newest man, and the two windows.",
      lessons: [
        {
          title: "The newest man in the room",
          kind: "content",
          minutes: 4,
          blocks: [
            { type: "text", markdown: "The ritual book tells a Master what to say. Nothing tells him that the culture of his Lodge is, for one year, his; that the newest member's whole impression of Freemasonry will be formed in that year; and that the year after the Chair is the second recognised point at which good men leave.\n\nThink of the most recently initiated Brother in your Lodge. His whole impression of Freemasonry will be formed in somebody's year in the Chair.\n\nThere are two recognised drop-out windows: the first two years, and the year after the Chair. The Master stands in both at once: his new members are in the first, and he is about to enter the second." },
            { type: "callout", tone: "tip", text: "Every Master should be able to name his newest member, say who his Personal Mentor is, and say what his next ceremony is. If he cannot, that is the first action." },
          ],
        },
      ],
    },
    {
      title: "Your year through a new man's eyes",
      summary: "Design the moments; don't leave them to chance.",
      lessons: [
        {
          title: "Moments to design",
          kind: "content",
          minutes: 6,
          blocks: [
            { type: "text", markdown: "Walk one year of your Lodge as an Initiate experiences it: the ballot, Initiation night, the second meeting that is mostly business, the nights he cannot attend, his Passing, the summer break. Which of those moments does your Lodge design, and which does it leave to chance?\n\n## The second meeting\n\nThe Initiate's second meeting is often mostly business, and nobody has told him. He sits at dinner next to two men who talk across him about people he does not know. It is the moment most often left to chance, and it is the Master's to design: a word before the meeting, a seat beside his mentor, a Brother briefed to include him.\n\n## The joke at the bar\n\n\"Well, look who's remembered where we meet.\" Everyone laughed; so did he; and he wrote his letter in January. The Master sets whether that joke gets told. One quiet word to the Lodge about how returning members are greeted is worth a year of retention work." },
          ],
        },
        {
          title: "Five things only the Master can do",
          kind: "content",
          minutes: 5,
          blocks: [
            { type: "text", markdown: "1. **Set the tone.** The culture of the Lodge for a year is the Master's. What he laughs at, who he sits with, how he speaks to the newest member: the Lodge copies it.\n2. **Hear the Lodge Mentor's report** on the Committee agenda, with the same weight as the Treasurer's. Ask who has a Personal Mentor and a Plan, who has been missed, and what the Lodge could change.\n3. **Brief the Lodge on mentoring** once in the year, in open Lodge: what mentoring is in Hertfordshire, and that we are all mentors to others. The Lodge Mentor has the presentation.\n4. **Protect juniors from pressure.** No office before ready; no ritual beyond ability; no Chapter sales pitch at the bar. And no capable man left waiting. The Master owns the office queue with the DC.\n5. **Own the Step 3 conversation.** When a member is drifting and the matter touches Lodge culture, office or another member, the Master has the conversation, with the Almoner alongside for welfare. \"How can we help?\", never \"Why weren't you there?\"" },
          ],
        },
      ],
    },
    {
      title: "The office queue",
      summary: "A bored Brother leaves as surely as a frightened one.",
      lessons: [
        {
          title: "Map your progressive officers",
          kind: "reflection",
          minutes: 5,
          prompt: "Map your progressive officers for the next three years. Name one man at risk of being pushed before he is ready, and one capable man left waiting. What will you do about each?",
          blocks: [{ type: "text", markdown: "Pressure works in both directions. Office before a man is ready, or ritual beyond his ability, can drive him away. So can years of waiting with nothing to do. A bored Brother leaves as surely as a frightened one." }],
        },
      ],
    },
    {
      title: "Running a happy year",
      summary: "Not the ritual: the management.",
      lessons: [
        {
          title: "Working with your officers",
          kind: "content",
          minutes: 6,
          blocks: [
            { type: "text", markdown: "| Officer | What to agree |\n|---|---|\n| Lodge Mentor | His report on the agenda; who has a mentor and a Plan; the office queue; the newest man. Three minutes a meeting. |\n| Director of Ceremonies | Ceremony preparation, the Lodge of Instruction, and how juniors are drawn into ritual gently. The office queue is a joint decision. |\n| Secretary | The candidate timeline your year hangs from; the attendance record after every meeting; same-day notice of any resignation. |\n| Almoner | Welfare, and Step 3 alongside you. Welcome new members jointly. |\n| Treasurer | Arrears as an early signal: a first missed subscription earns a quiet word, not a letter that reads like a final demand. |\n| Royal Arch Representative | One Journey's bridge. Agree what is said about the Royal Arch, when and by whom. Information, not recruitment. |" },
            { type: "text", markdown: "## The Festive Board\n\nNever let a new or joining member dine alone. The tone at the Festive Board is the Master's to set.\n\n## Family, Work, Masonry, for the Master too\n\nThe year in the Chair is the point at which a Lodge is most likely to ask too much of one man. The Master who delegates, who lets the Wardens and the DC carry their share, and who protects his own family and work, finishes the year wanting more Freemasonry, not less. It is a team, not a performance." },
          ],
        },
      ],
    },
    {
      title: "For the Wardens",
      summary: "Two years' notice.",
      lessons: [
        {
          title: "What to do now",
          kind: "content",
          minutes: 4,
          blocks: [
            { type: "text", markdown: "- Learn the Lodge, not only the ritual.\n- Shadow the Master at the Committee and with the Secretary.\n- Choose your team early, and kindly.\n- Plan your year's programme now.\n- Visit other Lodges.\n- Make sure the Royal Arch has been explained to you.\n- Keep your own mentor." },
          ],
        },
      ],
    },
    {
      title: "After the Chair",
      summary: "Included, Involved, Interested.",
      lessons: [
        {
          title: "The second window",
          kind: "content",
          minutes: 4,
          blocks: [
            { type: "text", markdown: "The Immediate Past Master's year decides whether a Lodge keeps its Past Masters. A seat is not a purpose. **Included, Involved, Interested**: a role, a project, a Brother to mentor. Agree it before Installation, not after.\n\nPast Masters make the best Personal Mentors because they remember what the Chair cost and what it gave." },
            { type: "callout", tone: "info", text: "The Immediate Past Master is not an officer of the Lodge. The year after the Chair comes with a seat and no role, unless the Lodge gives him one." },
          ],
        },
        {
          title: "Sketch your year after the Chair",
          kind: "reflection",
          minutes: 4,
          prompt: "Sketch your year after the Chair: a role, a project, and a Brother you could mentor. Then write one thing you will change in your year (or your two years as a Warden), and by when.",
          blocks: [{ type: "text", markdown: "Your Lodge Mentor will ask about it. Plan it from Installation day." }],
        },
      ],
    },
    {
      title: "Facts to have in your pocket",
      summary: "Twelve true-or-false statements, and ten more facts.",
      lessons: [
        {
          title: "True or false?",
          kind: "quiz",
          minutes: 8,
          isAssessment: true,
          maxAttempts: 3,
          blocks: [{ type: "text", markdown: "Twelve statements drawn from the Book of Constitutions as set out in the Provincial Secretaries' Handbook (2026), the Lodge Director of Ceremonies Guide (2025), the UGLE Members' Pathway papers and Solomon. You need 70% to pass." }],
          questions: [
            { kind: "true_false", prompt: "The Secretary accepts a resignation on the Lodge's behalf.", options: ["True", "False"], correct: [1], explanation: "He has no power to; he acknowledges receipt only. The man then has sixty days to withdraw it; in a Hermes Province the sixty days run from the day his email arrives. Spoken at the Risings, a resignation is irrevocable unless the Lodge votes on the spot to invite withdrawal. (Rule 183)" },
            { kind: "true_false", prompt: "The Immediate Past Master is an officer of the Lodge.", options: ["True", "False"], correct: [1], explanation: "The Handbook's precedence list says so in terms. The year after the Chair comes with a seat and no role, unless the Lodge gives him one." },
            { kind: "true_false", prompt: "A Lodge must leave at least four weeks between a candidate's degrees.", options: ["True", "False"], correct: [0], explanation: "True, and it is a minimum, not a target. A Degree by Request lets another Lodge pass or raise your candidate on a written request from the Master and Secretary. (Rules 172, 173)" },
            { kind: "true_false", prompt: "The Secretary may hold a Grand Lodge Certificate back until the Brother next attends.", options: ["True", "False"], correct: [1], explanation: "It is presented as soon as it arrives, or sent by recorded delivery and minuted. The presentation is a moment the Master can design." },
            { kind: "true_false", prompt: "A Warden invested a meeting late can still be elected Master the following year.", options: ["True", "False"], correct: [1], explanation: "Not without a dispensation. A Warden must serve a full year, Installation to Installation. (Rules 105a, 109)" },
            { kind: "true_false", prompt: "A Master may serve two years running in the same Lodge.", options: ["True", "False"], correct: [0], explanation: "True: proclaimed, not installed again; no Past Master's jewel until he installs his successor. (Rules 107, 115)" },
            { kind: "true_false", prompt: "A member two full years in arrears ceases to be a member automatically.", options: ["True", "False"], correct: [0], explanation: "True, announced in open Lodge and minuted. The Treasurer saw the first missed subscription eighteen months earlier: a quiet word then, not a letter. (Rule 148)" },
            { kind: "true_false", prompt: "Hertfordshire fire has the Provincial Grand Master's blessing.", options: ["True", "False"], correct: [0], explanation: "True, as a Provincial tradition, with the caveat that its speed should not become undignified. Show the new man before his first Festive Board." },
            { kind: "true_false", prompt: "Five Brethren are enough to open a Lodge.", options: ["True", "False"], correct: [0], explanation: "True: five, not counting the Tyler and candidate, including two members and one Installed Master. (Rule 119)" },
            { kind: "true_false", prompt: "The Deputy and Assistant Provincial Grand Masters attend as the Provincial Grand Master's representative.", options: ["True", "False"], correct: [1], explanation: "They represent themselves by their Patents; anyone wearing a chain represents themselves: offer the gavel." },
            { kind: "true_false", prompt: "A Brother who has resigned from every Lodge can never visit again.", options: ["True", "False"], correct: [1], explanation: "He may visit any Lodge once, and one Lodge three times in twelve months with a view to joining, if the Master confirms that purpose in writing to the Secretary. (Rule 127)" },
            { kind: "true_false", prompt: "Hermes tells the Almoner automatically after two consecutive misses.", options: ["True", "False"], correct: [0], explanation: "True. The call within seven days is still the Lodge's to make; wait for the notification and a month is already lost." },
          ],
        },
        {
          title: "Ten more facts",
          kind: "content",
          minutes: 5,
          blocks: [
            { type: "text", markdown: "- **Dispensations:** via Hermes, three weeks to three months ahead, before the summons is printed; a small fee; not granted automatically.\n- **The Installation speech:** about three minutes. Thank the electors and the organisers; do not repeat what others have said. Get the toast list early and practise the names and titles.\n- **The Master's Song:** Preceptors are asked to brief the Master so that he remembers to thank the proposer of his toast. The Master alone handles the gavel at dinner.\n- **The social year:** a very successful social year need not be expensive. Committee meetings take about thirty minutes.\n- **White Table:** never at an Installation or Initiation; anything on a Masonic subject is said in the meeting, not at dinner.\n- **The register:** the Secretary must record the reason for every cessation of membership. Resist \"he wasn't really right for us\". (Rule 146)\n- **Inclusion:** kneeling is not obligatory, and the candidate is consulted on the Volume of the Sacred Law used.\n- **The youngest Brother:** let him help the DC lay out the Lodge, so he learns what will happen.\n- **1813:** at the Union, Pure Antient Masonry was declared to consist of three degrees including the Supreme Order of the Holy Royal Arch. Information, never recruitment.\n- **What we do not claim:** there is no published national figure for the share of resignations in the first years or after the Chair. The two windows rest on Provincial experience and the Pathway papers. Say so if asked." },
            { type: "callout", tone: "info", text: "Fees, rules and procedures change. Check the current Secretaries' Handbook before relying on any detail here." },
          ],
        },
      ],
    },
  ],
};
