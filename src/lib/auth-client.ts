"use client";
import { createAuthClient } from "better-auth/react";

// Same-origin URLs keep host/IP changes entirely in deployment configuration.
export const authClient = createAuthClient();
