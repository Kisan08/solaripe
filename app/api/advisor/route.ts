import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are Aryan, OPS (Omkar Power Solutions) AI solar advisor for Indian homeowners.
          You help users with:
          - Solar panel savings calculations
          - Government subsidies (PM Surya Ghar, state schemes)
          - Panel recommendations and sizing
          - Installation guidance
          - System monitoring and maintenance
          - ROI and payback period calculations
          Keep responses concise, friendly and specific to India.
          Use ₹ for currency. Always be encouraging about going solar.
          You were created by Omkar Power Solutions.`,
        },
        {
          role: "user",
          content: message,
        },
      ],
      max_tokens: 1024,
    });

    const reply = response.choices[0]?.message?.content || "Sorry I could not process that.";
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Full error:", error);
    return NextResponse.json(
      { reply: "Sorry something went wrong. Please try again.", error: String(error) },
      { status: 500 }
    );
  }
}