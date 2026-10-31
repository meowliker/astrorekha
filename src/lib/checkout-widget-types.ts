export interface PayUBoltResponse {
  response: { txnStatus: string; txnid: string; mihpayid?: string; hash?: string; additionalCharges?: string };
}
export interface PayUBolt {
  launch(params: Record<string, unknown>, handlers: {
    responseHandler(response: PayUBoltResponse): void | Promise<void>;
    catchException(error: unknown): void;
  }): void;
}
export interface RazorpaySuccess { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
export interface RazorpayOptions {
  key?: string; amount: number; currency: string; name: string; description: string;
  order_id: string; handler(response: RazorpaySuccess): void | Promise<void>;
  prefill: { email: string }; theme: { color: string };
}
export type CheckoutWidgetWindow = Window & {
  bolt: PayUBolt;
  Razorpay: new (options: RazorpayOptions) => { on(event: string, handler: () => void): void; open(): void };
};
