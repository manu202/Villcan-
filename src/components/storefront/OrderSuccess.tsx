'use client';

interface OrderSuccessProps {
  orderCode: string;
  whatsappHref: string;
}

export function OrderSuccess({ orderCode, whatsappHref }: OrderSuccessProps) {
  return (
    <div className="order-success">
      <h2>¡Pedido #{orderCode} confirmado!</h2>
      <p>Enviá tu pedido por WhatsApp para coordinar la entrega.</p>
      <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="whatsapp-btn">
        Enviar por WhatsApp
      </a>

      <style>{`
        .order-success {
          text-align: center;
          padding: 48px 24px;
        }
        .order-success h2 {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 8px;
          color: var(--text-primary);
        }
        .order-success p {
          font-size: 14px;
          color: var(--text-secondary);
          margin-bottom: 20px;
        }
        .whatsapp-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 14px 24px;
          background: #25D366;
          color: #fff;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          text-decoration: none;
          min-height: 44px;
        }
      `}</style>
    </div>
  );
}
