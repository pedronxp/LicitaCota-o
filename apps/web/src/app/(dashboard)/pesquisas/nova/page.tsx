'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NovaPesquisaPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/pesquisas?nova=1'); }, [router]);
  return null;
}
