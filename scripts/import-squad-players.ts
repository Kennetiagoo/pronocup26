import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

type SquadPlayersFile = Record<
  string,
  {
    sourceName: string;
    sourceCode: string;
    players: Array<{ number: number; name: string }>;
  }
>;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no esta configurado.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function importSquads() {
  const filePath = path.join(process.cwd(), "prisma", "squad-players.json");
  const raw = await fs.readFile(filePath, "utf8");
  const squads = JSON.parse(raw) as SquadPlayersFile;

  let totalPlayers = 0;
  for (const [teamCode, squad] of Object.entries(squads)) {
    const names = squad.players.map((player) => player.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new Error(`Plantilla ${teamCode} tiene jugadores repetidos.`);
    }
    if (squad.players.length !== 26) {
      throw new Error(`Plantilla ${teamCode} debe tener 26 jugadores y tiene ${squad.players.length}.`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.teamPlayer.updateMany({
        where: { teamCode },
        data: { isActive: false, updatedAt: new Date() },
      });

      for (const player of squad.players) {
        await tx.teamPlayer.upsert({
          where: {
            teamCode_name: {
              teamCode,
              name: player.name.trim(),
            },
          },
          update: {
            number: player.number,
            isActive: true,
            updatedAt: new Date(),
          },
          create: {
            teamCode,
            name: player.name.trim(),
            number: player.number,
            isActive: true,
          },
        });
      }
    });
    totalPlayers += squad.players.length;
  }

  console.log(`Plantillas importadas: ${Object.keys(squads).length} selecciones, ${totalPlayers} jugadores.`);
}

importSquads()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
