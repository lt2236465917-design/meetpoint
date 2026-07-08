import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-white px-5">
      <h1 className="text-3xl font-semibold tracking-tight text-gray-950">
        多人异地见面，先算去哪座城
      </h1>
      <p className="mt-4 text-base leading-7 text-gray-600">
        收集每个人的出发城市和交通偏好，比较机票和高铁火车成本，生成省钱、均衡、省时三档建议。
      </p>
      <Link
        className="mt-8 rounded-lg bg-black py-3 text-center font-medium text-white"
        href="/create"
      >
        创建见面计划
      </Link>
    </main>
  );
}
