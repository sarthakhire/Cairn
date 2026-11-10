const { z } = require("zod");

// What the model may return. Anything else fails validation.
const ClaimItem = z.object({
  statement: z.string().trim().min(5).max(400),
  quote: z.string().trim().max(600).nullable().default(null),
  chunk: z.string().trim().max(12).nullable().default(null),
  subject: z.string().trim().max(60).nullable().default(null),
  nextAction: z.string().trim().max(300).nullable().default(null),
  inference: z.boolean().default(false),
});

const BatchSchema = z.object({ claims: z.array(ClaimItem).max(30) });
const SupportSchema = z.object({ supports: z.boolean() });
const ContradictSchema = z.object({ contradicts: z.boolean() });

module.exports = { BatchSchema, SupportSchema, ContradictSchema };