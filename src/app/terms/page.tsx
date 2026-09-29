export const metadata = {
  title: "利用規約 | medipre",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 text-center">
        <span className="text-lg font-black text-teal-700">medipre</span>
        <p className="text-xs text-gray-400 mt-0.5">利用規約</p>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 sm:p-8 space-y-6">
          <h1 className="text-lg font-black text-gray-900">Medipre 利用規約（患者・サービス利用者向け）</h1>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第1章 総則</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第1条（適用）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>本規約は、Medipre（以下「当方」）が、医院からの委託を受けて提供する、予約確認、キャンセルポリシーへの同意、キャンセル料の自動請求、空き枠通知等のサービス（以下「本サービス」）を、患者が利用する際の条件を定めます。</li>
                <li>患者は、本サービスの一部（キャンセルポリシーへの同意、カードの登録、通知の受信設定など）を利用することにより、本規約に同意したものとみなします。</li>
                <li>本サービスに関する予約、診療、キャンセル料の請求そのものの当事者は、患者と医院です。当方は、その間のやり取りを、システムを通じて仲介する者です。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第2条（定義）</h3>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>「医院」：本サービスを利用して、患者の予約、同意、キャンセル料の管理を行う、歯科医院その他の医療機関</li>
                <li>「患者」：医院の診療、予約の対象となり、本サービスを利用する方</li>
                <li>「キャンセルポリシー」：医院が定める、キャンセル料の発生条件、金額、期限に関する取り決め</li>
                <li>「回収機能」：患者のカード登録、キャンセル料の判定と請求を行う、本サービスの機能</li>
                <li>「Stripe」：決済サービスを提供する Stripe, Inc. およびその関連会社</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第3条（規約の変更）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方は、本サービスの内容の変更に伴い必要な場合、本規約を変更することがあります。</li>
                <li>重要な変更をするときは、本サービスの画面上での掲示、または登録されたメールアドレスへの通知により、周知します。</li>
                <li>変更後に本サービスを利用した場合、変更後の内容に同意したものとみなします。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第2章 サービスの内容と当方の立場</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第4条（サービスの内容）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">本サービスは、次のうち、医院が導入している範囲を、患者に提供します。</p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>予約内容の確認、予約確定の通知（QRチケットを含みます）</li>
                <li>キャンセルポリシーの提示と、同意の取得</li>
                <li>カードの登録、キャンセル料の自動請求（回収機能）</li>
                <li>キャンセルで生じた空き枠を、希望する患者へ知らせる通知</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第5条（当方の立場）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方は、医院から、本サービスの提供に必要な範囲で、患者データの取扱いを委託された者です。患者との診療契約、予約契約の当事者ではありません。</li>
                <li>キャンセルポリシーの内容（対象、時期、割合、金額）は、医院が定めるものです。当方は、その内容の当否を判断せず、医院の設定に従ってシステムを動かします。</li>
                <li>予約の変更、キャンセルの申出、診療上の判断についての問い合わせは、医院に行ってください。当方は、これらについて回答する立場にありません。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第3章 キャンセルポリシーとキャンセル料</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第6条（キャンセルポリシーへの同意）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>患者は、予約確認の画面で提示されるキャンセルポリシーの内容を確認し、同意したうえで、予約を確定します。</li>
                <li>キャンセルポリシーの内容（対象となる診療、無料となる期限、段階ごとの割合、無断キャンセル時の扱い）は、医院ごとに異なります。患者は、予約のたびに、表示された内容を確認してください。</li>
                <li>同意した日時と、同意した時点の文言は、本サービスに記録されます。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第7条（キャンセル料の自動請求）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>医院が回収機能を有効にしている場合、患者が登録したカードに対して、キャンセルポリシーの条件に従い、キャンセル料が自動で請求されることがあります。</li>
                <li>請求は、患者が予約をキャンセルしたとき、または、予約の日時を過ぎても来院がなかったとき（無断キャンセル）に、医院が設定した条件に基づいて行われます。</li>
                <li>請求される金額は、医院が定めたキャンセルポリシーの内容によります。当方は、金額の妥当性を判断しません。</li>
                <li>カードの登録は、キャンセル料の請求のために行われるものであり、来院した場合や、無料の期限内にキャンセルした場合には、請求は行われません。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第8条（請求に関する問い合わせ、返金）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>請求された金額についての問い合わせ、返金の申出は、予約先の医院に対して行ってください。</li>
                <li>返金の可否、金額は、医院が判断します。当方は、返金の当事者にはなりません。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第4章 カード情報と決済</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第9条（カード情報の取扱い）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>患者が登録するカード情報は、決済サービスを提供する Stripe に直接送信されます。当方は、カード番号を保存せず、当方のサーバーを経由させません。</li>
                <li>カードの登録、キャンセル料の決済に関する事項は、Stripe が定める規約にも従います。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第10条（決済の失敗）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>カードの上限、有効期限切れ、金融機関側の事情その他の理由で、決済ができないことがあります。</li>
                <li>決済ができなかった場合、医院からの連絡に基づき、別のカードでの再登録を求められることがあります。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第5章 空き枠通知</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第11条（通知の受信）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>患者は、他の患者のキャンセルにより生じた空き枠の通知を、受け取るかどうかを選ぶことができます。</li>
                <li>通知には、医院名と、空いた日時のみが記載されます。キャンセルした患者の氏名、診療内容その他の個人情報は含まれません。</li>
                <li>空き枠は、先着順で予約が成立します。通知を受け取ったことが、予約を保証するものではありません。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第12条（配信停止）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">患者は、通知内に示された方法により、いつでも通知の配信停止を申し出ることができます。申出の後、当方は、速やかに配信を停止します。</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第6章 個人情報</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第13条（個人情報の取扱いの役割）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>患者の氏名、連絡先、予約内容、キャンセルポリシーへの同意の記録その他の情報（以下「患者データ」）について、個人情報の保護に関する法律上の個人情報取扱事業者は、医院です。</li>
                <li>当方は、医院から委託を受けて、本サービスの提供に必要な範囲でのみ、患者データを取り扱います。当方自身の広告、他の医院への提供その他の目的には使用しません。</li>
                <li>患者データの開示、訂正、利用停止等の請求は、予約先の医院に対して行ってください。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第14条（安全管理）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">当方は、患者データの漏えい、滅失、毀損を防ぐため、合理的な技術的、組織的な措置を講じます。</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第15条（委託先）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">当方は、本サービスの提供のため、データの保管、送信、決済等について、外部の事業者を利用します。これらの事業者に対しては、必要かつ適切な監督を行います。</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第16条（カード情報を除く理由）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">カード情報は、第9条のとおり Stripe に直接送信され、当方は取得、保存しません。そのため、本規約における患者データには、カード番号を含みません。</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第7章 免責と責任</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第17条（免責）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方は、本サービスが中断、遅延、停止しないこと、不具合が生じないことを保証しません。システムの保守、点検、外部サービス（Stripe、通信回線等）の障害、天災その他のやむを得ない事情により、本サービスの全部または一部が利用できないことがあります。</li>
                <li>
                  当方は、次の事項について、医院との契約に基づいて医院が対応するべきものと位置づけており、当事者にはなりません。
                  <ul className="list-disc pl-5 mt-1.5 space-y-1">
                    <li>キャンセル料の金額、設定の当否</li>
                    <li>診療の予約、変更、キャンセルの可否についての判断</li>
                    <li>キャンセル料の返金、請求への異議申立てへの対応</li>
                  </ul>
                </li>
                <li>前項の事項について、患者と医院の間に生じた紛争は、患者と医院の間で解決してください。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第18条（責任の制限）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                当方が、本サービスの提供に関して患者に対して責任を負う場合、その責任は、当方に故意または重大な過失があるときを除き、当方が本サービスの提供により患者から直接収受した金銭の額を上限とします。当方は、患者から利用料を受け取っていないため、通常、この上限は生じません。
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第8章 その他</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第19条（問い合わせ先）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">本サービスに関するお問い合わせは、support@medipre.jp までご連絡ください。診療、予約、キャンセル料についてのお問い合わせは、予約先の医院に、直接ご連絡ください。</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第20条（分離可能性）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">本規約のいずれかの条項が無効または執行できないと判断されても、他の条項は有効に存続します。</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第21条（準拠法と管轄）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">本規約は、日本法に基づいて解釈されます。本規約に関して紛争が生じたときは、東京地方裁判所を、第一審の専属的合意管轄裁判所とします。</p>
            </div>
          </section>

          <section className="space-y-2 border-t border-gray-100 pt-4">
            <h2 className="text-base font-bold text-gray-900">附則</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
              <li>施行日：2026年9月29日</li>
              <li>運営者：Medipre</li>
              <li>連絡先：support@medipre.jp</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
