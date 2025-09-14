# ⚔️ Vocab Battle

A real-time multiplayer vocabulary training app built with **Next.js**,
**Tailwind CSS**, **shadcn/ui**, and **Prisma**.\
Challenge friends (or strangers) to fast-paced vocabulary battles and
level up your language skills!

------------------------------------------------------------------------

## 🚀 Features

-   🔥 **Real-time battles** -- Compete against others in vocabulary
    duels\
-   🎨 **Modern UI** -- Styled with Tailwind and shadcn/ui components\
-   🗂 **Database powered** -- Prisma ORM with a relational DB (SQLite,
    PostgreSQL, etc.)\
-   🌐 **Next.js 13+** -- App Router, API routes, and server components\
-   📱 **Responsive design** -- Works great on desktop and mobile

------------------------------------------------------------------------

## 🛠️ Tech Stack

-   [Next.js](https://nextjs.org/) -- React framework\
-   [Tailwind CSS](https://tailwindcss.com/) -- Utility-first styling\
-   [shadcn/ui](https://ui.shadcn.com/) -- Accessible and beautiful
    components\
-   [Prisma](https://www.prisma.io/) -- Next-gen ORM\
-   [WebSockets /
    Real-time](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
    -- For battle sync (via Next.js Route Handlers +
    ws/socket.io/Ably/etc.)

------------------------------------------------------------------------

## 📦 Getting Started

### 1. Clone the repository

``` bash
git clone https://github.com/yourusername/vocab-battle.git
cd vocab-battle
```

### 2. Install dependencies

``` bash
npm install
# or
yarn install
```

### 3. Set up environment variables

Create a `.env` file in the root of the project:

``` env
DATABASE_URL="file:./dev.db" # or your PostgreSQL/MySQL connection string
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Set up the database

``` bash
npx prisma migrate dev
```

(Optional) Open Prisma Studio to view/edit the DB:

``` bash
npx prisma studio
```

### 5. Run the development server

``` bash
npm run dev
# or
yarn dev
```

Visit 👉 <http://localhost:3000>

------------------------------------------------------------------------

## 🧩 Project Structure

    .
    ├── app/                # Next.js app router
    ├── components/         # Reusable UI components (shadcn)
    ├── lib/                # Utilities, helpers
    ├── prisma/             # Prisma schema and migrations
    ├── public/             # Static assets
    ├── styles/             # Tailwind styles
    └── README.md

------------------------------------------------------------------------

## 🌍 Deployment

You can deploy the app easily to [Vercel](https://vercel.com/)
(recommended).\
Make sure to set your `DATABASE_URL` in the Vercel project settings.

------------------------------------------------------------------------

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull
request.

------------------------------------------------------------------------

## 📜 License

MIT License © 2025
