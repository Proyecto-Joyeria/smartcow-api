import { defineConfig } from 'vitest/config';
import path from 'path';

const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    include:     ['tests/**/*.test.ts'],
    env: {
      TWO_FACTOR_ENCRYPTION_KEY: '9c98df603b718a2b44090d295e06f789c959c3167d680fca1254f2defd9e477c',
    },
  },
  resolve: {
    alias: [
      { find: /^@auth\/(.+)$/,          replacement: `${r('src/auth')}/$1`          },
      { find: /^@animals\/(.+)$/,        replacement: `${r('src/animals')}/$1`        },
      { find: /^@admin\/(.+)$/,          replacement: `${r('src/admin')}/$1`          },
      { find: /^@common\/(.+)$/,         replacement: `${r('src/common')}/$1`         },
      // Excluye @prisma/client (npm package) — solo aliasea @prisma/prisma.service
      { find: /^@prisma\/(?!client)(.+)$/, replacement: `${r('src/prisma')}/$1`      },
      { find: /^@redis\/(.+)$/,          replacement: `${r('src/redis')}/$1`          },
      { find: /^@gps\/(.+)$/,            replacement: `${r('src/gps')}/$1`            },
      { find: /^@geofence\/(.+)$/,       replacement: `${r('src/geofence')}/$1`       },
      { find: /^@alerts\/(.+)$/,         replacement: `${r('src/alerts')}/$1`         },
      { find: /^@realtime\/(.+)$/,       replacement: `${r('src/realtime')}/$1`       },
      { find: /^@notifications\/(.+)$/,  replacement: `${r('src/notifications')}/$1`  },
      { find: /^@reports\/(.+)$/,        replacement: `${r('src/reports')}/$1`        },
      { find: /^@ai\/(.+)$/,             replacement: `${r('src/ai')}/$1`             },
      { find: /^@workers\/(.+)$/,        replacement: `${r('src/workers')}/$1`        },
    ],
  },
});
