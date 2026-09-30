export const metadata = {
  title: "利用規約（医院向け） | medipre",
};

export default function ClinicTermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-4 text-center">
        <span className="text-lg font-black text-teal-700">medipre</span>
        <p className="text-xs text-gray-400 mt-0.5">利用規約（医院向け）</p>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 sm:p-8 space-y-6">
          <h1 className="text-lg font-black text-gray-900">medipre 利用規約（医院向け）</h1>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第1章 総則</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第1条（適用）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>本規約は、medipre（以下「当方」）が提供する、予約確認、患者の同意取得、キャンセル料の回収等のサービス（以下「本サービス」）の利用条件を定めます。</li>
                <li>医院が利用を申し込み、当方が承認した時に、医院と当方の間で、本規約を内容とする契約（以下「本契約」）が成立します。</li>
                <li>料金表その他、当方が別に定める規定は、本規約の一部となります。本規約と矛盾する場合は、当方と医院が個別に合意した内容が優先します。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第2条（定義）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">本規約で使う用語の意味は、次のとおりです。</p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>「医院」：本サービスを事業として利用する、歯科医院その他の医療機関（個人、法人を問いません）</li>
                <li>「患者」：医院の診療、予約の対象となる方</li>
                <li>「利用者」：医院およびそのスタッフ</li>
                <li>「患者データ」：医院が本サービスに入力し、または本サービスを通じて取得した、患者に関する情報</li>
                <li>「キャンセル料」：医院が定めた条件に基づき、医院が患者に請求する金銭</li>
                <li>「回収機能」：患者のカード登録、キャンセル料の判定と請求を行う、本サービスの機能</li>
                <li>「Stripe」：決済サービスを提供する Stripe, Inc. およびその関連会社</li>
                <li>「Stripe規約」：Stripe が医院に適用する規約（Connected Account Agreement を含みます）</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第3条（規約の変更）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>
                  当方は、次のいずれかに当てはまる場合に、本規約を変更できます。
                  <ul className="list-disc pl-5 mt-1.5 space-y-1">
                    <li>変更が、医院の一般の利益に適合するとき</li>
                    <li>変更が、契約の目的に反せず、変更の必要性、内容の相当性、変更に関する定めの有無その他の事情に照らして、合理的なとき</li>
                  </ul>
                </li>
                <li>当方は、変更の効力が生じる日の30日前までに、変更後の内容と効力発生日を、登録メールアドレスへの通知、または本サービス上の掲示で周知します。</li>
                <li>変更に異議がある医院は、効力発生日の前日までに、第34条により解約できます。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第2章 登録と承認</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第4条（申込）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>利用を希望する医院は、当方が定める方法で、医院名、院長名、連絡先メールアドレス等を登録し、本規約に同意して申し込みます。</li>
                <li>申込者は、医院を代表して申し込む権限を有することを表明し、保証します。</li>
                <li>申込者は、登録内容を、真実かつ正確に入力します。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第5条（承認）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方は、申込内容を確認し、承認するか否かを決定します。承認は、登録メールアドレスへのメールで通知します。</li>
                <li>
                  次のいずれかに当てはまる場合、当方は、承認しないことがあります。理由を開示する義務は負いません。
                  <ul className="list-disc pl-5 mt-1.5 space-y-1">
                    <li>登録内容に、虚偽、誤りまたは不足があるとき</li>
                    <li>医院として実在することが確認できないとき</li>
                    <li>反社会的勢力に当てはまるおそれがあるとき</li>
                    <li>過去に、本規約への違反により契約を解除されたことがあるとき</li>
                    <li>その他、当方が不適当と判断したとき</li>
                  </ul>
                </li>
                <li>承認までの間、医院は本サービスを利用できません。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第6条（登録情報の変更）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">医院は、登録内容に変更があったときは、遅滞なく、当方が定める方法で変更の手続をします。手続がなかったことで医院に生じた不利益について、当方は責任を負いません。</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第7条（アカウントの管理）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>医院は、自己の責任で、ID、パスワード等を管理します。第三者に利用させ、貸与し、譲渡してはなりません。</li>
                <li>医院のアカウントを用いて行われた行為は、医院の行為とみなします。ただし、当方に故意または重過失があるときは、この限りではありません。</li>
                <li>医院は、不正な使用のおそれを知ったときは、直ちに当方に連絡します。</li>
                <li>医院は、スタッフに本規約を守らせ、スタッフの行為について責任を負います。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第3章 サービスと料金</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第8条（サービスの内容）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>
                  本サービスは、次の機能で構成されます。機能の追加、変更、終了は、第30条によります。
                  <ul className="list-disc pl-5 mt-1.5 space-y-1">
                    <li>予約の登録、確認URLの発行、QRチケット</li>
                    <li>患者への説明と同意の取得、その記録</li>
                    <li>患者のカード登録と、キャンセル料の判定、請求（回収機能。Stripe の決済基盤を利用します）</li>
                    <li>キャンセルで生じた空き枠を、通知を希望した患者へ自動で知らせる機能</li>
                    <li>予約、キャンセル、回収の状況を確認する管理画面</li>
                  </ul>
                </li>
                <li>回収機能は、医院が第12条の Stripe 連携を完了し、当方が有効にした場合に、利用できます。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第9条（利用料金）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>医院は、次の料金（すべて税別表記とし、消費税相当額を別途加算します）を支払います。</li>
              </ol>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-1.5 pr-3 text-left text-gray-600 font-bold">項目</th>
                      <th className="py-1.5 text-left text-gray-600 font-bold">内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-gray-100">
                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap align-top">入会金、初期費用</td>
                      <td className="py-2 text-gray-700">無料</td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap align-top">月額利用料</td>
                      <td className="py-2 text-gray-700">9,800円。回収機能を有効にした月を初月とし、初月は無料。翌月から発生します</td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap align-top">回収手数料（従量）</td>
                      <td className="py-2 text-gray-700">回収に成功したキャンセル料の額の5%（円未満は切り捨て）</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed" start={2}>
                <li>回収機能を使わない間は、月額利用料は発生しません。</li>
                <li>回収手数料は、Stripe の機能（アプリケーション手数料）により、キャンセル料の決済時に、当方の取り分として自動で差し引かれます。</li>
                <li>月額利用料の日割り計算は、行いません</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第10条（支払い）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>月額利用料は、当方が指定する方法（Stripe による請求を想定）で、毎月末日締め、翌月末日までに支払います。</li>
                <li>医院が支払を遅らせたときは、支払期日の翌日から支払済みまで、年14.6%の割合による遅延損害金を支払います</li>
                <li>受領した料金は、当方の責めに帰すべき事由がある場合を除き、返還しません。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第11条（料金の変更）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方は、料金を改定できます。改定は、第3条の手続に従い、効力発生日の30日前までに周知します。</li>
                <li>改定に同意しない医院は、第34条により解約できます。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第4章 Stripe連携とキャンセル料の回収</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第12条（Stripe連携）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>回収機能を使う医院は、自己の名義（医院または院長個人）で Stripe のアカウントを開設し、Stripe規約に同意します。</li>
                <li>本人確認、口座の確認、Stripe規約への同意は、医院の代表者自身が、Stripe の画面で行います。当方は、代行できません。</li>
                <li>Stripe が審査を完了しない場合や、アカウントを停止、制限した場合、回収機能は使えません。この結果について、当方は責任を負いません。</li>
                <li>医院は、Stripe に提供する情報が、真実、正確かつ最新であることを保証します。</li>
                <li>決済に関する事項について、Stripe規約と本規約が矛盾する場合は、Stripe規約が優先します。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第13条（資金の流れと当方の立場）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>回収機能では、患者のカードから、医院の Stripe アカウントへ、キャンセル料が直接入金されます。当方は、患者から医院への資金を預からず、当方の口座を経由させません。</li>
                <li>医院の口座への振込の時期と方法は、Stripe の定めによります。当方は、振込の時期を約束せず、遅延や不履行に責任を負いません。</li>
                <li>当方は、Stripe の機能を通じて、キャンセル料の判定と請求の指示を行うシステムを提供する者です。医院と患者の間の金銭債権の当事者ではありません。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第14条（手数料）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>キャンセル料の決済には、Stripe の決済手数料がかかります。この手数料は、医院が負担し、Stripe が医院の受取額から差し引きます。</li>
                <li>料率は Stripe が定め、変更されることがあります。本規約や当方の案内に記載した料率と金額の例は、参考であり、実際の額を保証しません。</li>
                <li>医院の受取額は、キャンセル料の額から、Stripe の決済手数料と、第9条第3項の回収手数料を差し引いた額です。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第15条（キャンセル料の請求と回収）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方のシステムは、医院が設定した条件（キャンセルの時期、段階ごとの割合、基準額）に従い、キャンセル料の額を自動で判定し、患者が登録したカードに請求します。</li>
                <li>
                  請求は、次のすべてを満たす場合に行われます。
                  <ul className="list-disc pl-5 mt-1.5 space-y-1">
                    <li>患者が、キャンセルポリシーに同意していること</li>
                    <li>患者が、カードを登録していること</li>
                    <li>医院が、回収機能を有効にしていること</li>
                    <li>医院の Stripe 連携が、完了していること</li>
                  </ul>
                </li>
                <li>無断不来院の自動判定のように、医院の操作を待たずに行われる請求があります。医院は、あらかじめ、設定内容を確認します。設定内容の誤りから生じた請求について、当方は責任を負いません。</li>
                <li>カードの拒否、認証の失敗、Stripe や通信の障害などで、請求が成立しないことがあります。当方は、請求の成立を保証しません。失敗した請求は、翌日に1回だけ、再試行されることがあります。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第16条（返金、異議申立て、損失）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>キャンセル料の返金は、医院が自己の責任と判断で行います。医院と患者の間の返金、苦情、紛争は、医院が自己の責任で対応し、解決します。当方は、当事者になりません。</li>
                <li>患者、カード会社その他から、キャンセル料の請求への異議申立て（チャージバック）があったときは、医院が、自己の費用と責任で対応します。Stripe が定める手数料、返金の額、異議申立ての手数料その他の費用は、医院が負担します。</li>
                <li>医院の Stripe 残高が不足した場合その他の事情で、Stripe が当方に負担を求めたとき（当方が Stripe に対して損失の責任を負う場合を含みます）、医院は、当方が負担した額の全額と、合理的な費用を、当方の請求から14日以内に支払います</li>
                <li>当方は、前3項への対応に必要な範囲で、医院の取引情報や患者データを Stripe に提供することがあります。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第5章 医院の責任</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第17条（キャンセル料の設定）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>キャンセル料の条件（対象、時期、割合、基準額、無料の期間）は、医院が自己の責任で設定します。当方は、内容の適法性や妥当性を確認せず、保証しません。</li>
                <li>患者が消費者である場合、キャンセル料のうち、医院に生じる平均的な損害の額を超える部分は、消費者契約法第9条第1号により、無効になり得ます。医院は、この点を理解し、設定した内容に合理的な根拠があることを確認します。根拠（例：準備に要する費用、他の患者で枠を埋められない事情）は、医院が記録し、求めに応じて示せる状態にします。</li>
                <li>法令、ガイドライン、または所管官庁の指導により、キャンセル料の請求が制限され、または認められない診療について、医院は、本サービスでキャンセル料の対象にしません。</li>
                <li>当方が、標準の設定例や表示を提供する場合があります。これらは参考であり、医院の設定についての助言ではありません。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第18条（患者への説明と同意）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>医院は、キャンセル料の条件を、予約の前または予約時に、患者に分かりやすく示し、同意を得ます。本サービスの同意取得機能は、その補助であり、同意が有効であることを保証しません。</li>
                <li>医院は、カード情報の登録が、キャンセル料の請求のために行われることを、患者に説明します。</li>
                <li>同意の記録（日時、同意した文面の写し）は、本サービスに保存されます。保存については、第25条によります。</li>
                <li>患者からの問い合わせには、医院が自ら対応します。当方は、患者から問い合わせを受けた場合、医院に案内することがあります。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第19条（診療上の判断）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>本サービスは、診療行為ではありません。診療、診断、予約の受諾、変更、キャンセルの判断は、医院が行います。当方は、これらに責任を負いません。</li>
                <li>やむを得ない事情がある患者への、請求の免除や減額は、医院の責任と判断で行います。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第20条（空き枠の通知）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>空き枠の通知は、患者が受信を希望し、同意した場合にだけ、送信されます。医院は、患者が受信を止める方法（配信停止）が、通知に添えられることを了承します。</li>
                <li>医院は、通知の対象、頻度、内容が、法令（特定電子メール法を含みます）に反しないよう、管理します。</li>
                <li>通知には、他の患者の氏名、診療内容、キャンセル理由その他の個人情報を含めません。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第6章 個人情報とデータ</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第21条（個人情報の取扱い）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>患者データについて、医院は、個人情報の保護に関する法律（以下「個人情報保護法」）上の個人情報取扱事業者として、利用目的の特定と公表、適正な取得、第三者提供の制限などの義務を負います。</li>
                <li>当方は、患者データを、医院の委託を受けて、本サービスの提供に必要な範囲でだけ取り扱います。広告、他の医院への提供その他、当方自身の目的には使いません。ただし、個人を特定できないように加工した統計情報は、サービスの改善に使うことがあります。</li>
                <li>医院は、患者データを本サービスに入力し、当方と第23条の委託先に取り扱わせることについて、法令上必要な手続をとります。</li>
                <li>患者本人からの、開示、訂正、利用停止などの請求には、医院が対応します。当方は、必要な範囲で協力します。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第22条（要配慮個人情報）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>診療の内容、病歴その他の患者に関する情報は、要配慮個人情報に当たることがあります。医院は、取得のときに患者の同意を得るなど、法令に従います。</li>
                <li>当方は、カード番号を保存しません。カード情報は、Stripe に直接送信され、当方のサーバーを通りません。</li>
                <li>医院は、予約内容の欄などに、診療上必要のない情報（病名、症状の詳細など）を入力しないよう努めます。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第23条（安全管理と委託先）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方は、患者データの漏えい、滅失、毀損の防止その他の安全管理のため、合理的な技術的、組織的な措置をとります。</li>
                <li>当方は、本サービスの提供のため、次の事業者のサービスを利用します。医院は、これを承諾します。次の一覧は、本規約の施行時点のものです。委託先を変更する場合、当方はあらかじめ医院に通知します。</li>
              </ol>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-1.5 pr-3 text-left text-gray-600 font-bold">目的</th>
                      <th className="py-1.5 text-left text-gray-600 font-bold">事業者</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-gray-100">
                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">データの保管</td>
                      <td className="py-2 text-gray-700">Supabase</td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">ホスティング</td>
                      <td className="py-2 text-gray-700">Vercel</td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">メールの送信</td>
                      <td className="py-2 text-gray-700">Resend</td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">決済</td>
                      <td className="py-2 text-gray-700">Stripe</td>
                    </tr>
                    <tr className="border-t border-gray-100">
                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">ネットワーク、受信メールの転送</td>
                      <td className="py-2 text-gray-700">Cloudflare</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed" start={3}>
                <li>当方は、委託先に対して、必要かつ適切な監督を行います。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第24条（漏えい等への対応）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方は、患者データの漏えい等が生じ、または生じたおそれを知ったときは、遅滞なく、医院に通知します。</li>
                <li>個人情報保護委員会への報告と、患者本人への通知は、法令に従い、医院が主体となって行います。当方は、事実関係の調査と、報告に必要な情報の提供により、協力します。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第25条（データの返還と削除）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>本契約が終了したときは、当方は、医院の請求により、患者データを、当方が定める形式で提供します。請求は、終了後30日以内に行います</li>
                <li>前項の提供または期間の経過の後、当方は、患者データを削除します。ただし、法令上保存が必要なもの（決済や監査に関する記録など）と、紛争への対応に必要な最小限の記録は、必要な期間、保管します。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第7章 禁止事項、反社会的勢力の排除、知的財産、秘密保持</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第26条（禁止事項）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">医院と利用者は、次の行為をしてはなりません。</p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>法令または公序良俗に反する行為</li>
                <li>虚偽の情報の登録、なりすまし</li>
                <li>当方、Stripe、他の医院、患者その他の第三者の権利や利益を侵害する行為</li>
                <li>実際の予約に基づかない請求、患者の同意がない請求など、キャンセル料の名目で不当に金銭を請求する行為</li>
                <li>第17条に反する内容で、キャンセル料を設定する行為</li>
                <li>本サービスのシステムへの不正なアクセス、過度な負荷をかける行為、解析や複製の行為</li>
                <li>当方の許可なく、本サービスを第三者に提供し、または再販する行為</li>
                <li>反社会的勢力に利益を供与する行為</li>
                <li>その他、当方が不適切と判断する行為</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第27条（反社会的勢力の排除）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>医院は、自己と、その役員、スタッフが、暴力団、暴力団員、暴力団準構成員、暴力団関係企業、総会屋、社会運動等標ぼうゴロ、特殊知能暴力集団その他これらに準ずる者（以下「反社会的勢力」）に当たらず、将来も当たらないことを、表明し、保証します。</li>
                <li>医院は、反社会的勢力と、資金の提供、便宜の供与その他の関係を持たないことを、保証します。</li>
                <li>医院が前2項に違反したときは、当方は、催告なく、本契約を解除し、または利用を停止できます。これにより医院に生じた損害について、当方は責任を負いません。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第28条（知的財産権）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>本サービスに関する著作権、商標権その他の知的財産権は、当方または正当な権利者に帰属します。本契約は、医院に、本契約の範囲で本サービスを利用する、譲渡できない非独占的な権利を与えるものです。</li>
                <li>医院が入力した、医院の名称、文言、設定内容の権利は、医院に帰属します。医院は、当方に、本サービスの提供、運営、改善のために必要な範囲で、これらを利用する権利を許諾します。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第29条（秘密保持）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方と医院は、相手方から開示された、秘密であると示された情報、および性質上秘密とすべき情報（患者データを含みます）を、相手方の事前の同意なく、第三者に開示、漏えいしません。</li>
                <li>
                  次の情報は、前項の対象外です。
                  <ul className="list-disc pl-5 mt-1.5 space-y-1">
                    <li>開示を受けた時に、すでに公知だったもの</li>
                    <li>開示を受けた後、受領者の責めによらず、公知になったもの</li>
                    <li>正当な権限を持つ第三者から、秘密保持の義務を負わずに得たもの</li>
                    <li>開示された情報によらず、独自に開発したもの</li>
                  </ul>
                </li>
                <li>法令、裁判所、行政機関の命令により開示を求められたときは、必要な範囲で開示できます。その場合は、可能な限り、事前に相手方に通知します。</li>
                <li>本条は、本契約の終了後も、3年間、有効です</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第8章 免責、責任の制限、解約</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第30条（サービスの変更、中断、終了）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方は、本サービスの内容を、変更し、追加できます。医院に重大な不利益を与える変更は、30日前までに通知します。</li>
                <li>
                  当方は、次の場合、事前の通知なく、本サービスの全部または一部を、一時的に中断できます。
                  <ul className="list-disc pl-5 mt-1.5 space-y-1">
                    <li>システムの保守、点検</li>
                    <li>天災、停電、通信回線の障害、Stripe その他の外部サービスの障害</li>
                    <li>セキュリティ上の緊急の必要</li>
                    <li>その他、やむを得ない事情</li>
                  </ul>
                </li>
                <li>当方は、60日前までに通知して、本サービスの全部または一部を終了できます。終了の場合、当方は、終了日以降の期間に対応する、支払済みの月額利用料を返還します</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第31条（免責）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方は、本サービスが、医院の特定の目的に合うこと、期待する効果（キャンセルの減少、回収額など）が得られること、不具合がないことを、保証しません。</li>
                <li>
                  当方は、次の事由から医院に生じた損害について、責任を負いません。ただし、当方に故意または重過失があるときは、この限りではありません。
                  <ul className="list-disc pl-5 mt-1.5 space-y-1">
                    <li>Stripe、カード会社、通信事業者その他の第三者の行為、障害、規約の変更</li>
                    <li>患者の行為（キャンセルの意思表示の誤り、カード情報の誤り、異議申立てなど）</li>
                    <li>医院が設定した内容の誤り</li>
                    <li>天災その他の不可抗力</li>
                  </ul>
                </li>
                <li>医院と患者その他の第三者との間の紛争は、医院が自己の責任で解決します。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第32条（責任の制限）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方が医院に対して負う損害賠償の責任は、債務不履行、不法行為その他の原因を問わず、当方に故意または重過失がある場合を除き、責任の原因が生じた時から遡って12か月間に、医院が当方に支払った利用料（月額利用料と回収手数料）の合計額を上限とします</li>
                <li>当方は、特別の事情から生じた損害、逸失利益、間接損害について、予見できたか否かを問わず、責任を負いません。ただし、当方に故意または重過失があるときは、この限りではありません。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第33条（利用停止と解除）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>
                  医院が次のいずれかに当てはまる場合、当方は、催告なく、利用を停止し、または本契約を解除できます。
                  <ul className="list-disc pl-5 mt-1.5 space-y-1">
                    <li>登録内容に、虚偽があったとき</li>
                    <li>第27条に違反したとき</li>
                    <li>Stripe により、アカウントが停止、制限されたとき</li>
                    <li>支払の停止、破産手続や民事再生手続の開始の申立てなど、信用に不安が生じたとき</li>
                    <li>診療所の廃止など、医院として事業を続けられなくなったとき</li>
                    <li>患者や第三者の権利を、著しく害するおそれがあるとき</li>
                    <li>その他、本契約を続けがたい重大な事由があるとき</li>
                  </ul>
                </li>
                <li>医院が、本規約に違反し、当方が相当の期間を定めて是正を求めても是正しないとき、または料金の支払を遅らせたときも、当方は、利用を停止し、または本契約を解除できます。</li>
                <li>利用停止や解除により、医院に生じた損害について、当方は、故意または重過失がある場合を除き、責任を負いません。</li>
                <li>解除の場合、医院は、当方に対する債務について、期限の利益を失い、直ちに支払います。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第34条（解約）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>医院は、当方が定める方法（登録メールアドレスからの申出、または管理画面）で、いつでも解約できます。解約は、申出のあった月の末日に、効力が生じます。最低利用期間は、ありません</li>
                <li>解約の時点で未払の料金があるときは、医院は、これを支払います。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第35条（契約終了後の措置）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>本契約が終了した後も、次の条項は有効です。第9条と第10条（未払分）、第13条、第14条、第16条、第21条から第25条、第28条、第29条、第31条、第32条、本条、第39条。</li>
                <li>本契約の終了後、当方のシステムは、その医院について、新たな請求を行いません。すでに請求済みで、処理中の金銭の扱いは、Stripe の定めによります。</li>
                <li>患者データの扱いは、第25条によります。</li>
              </ol>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">第9章 その他</h2>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第36条（通知）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>当方から医院への通知は、登録メールアドレスへのメールの送信、または本サービス上の表示で行います。メールで通知した場合は、送信した時に、到達したものとみなします。医院は、メールが届く状態を保ちます。</li>
                <li>医院から当方への連絡は、support@medipre.jp に対して行います。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第37条（権利義務の譲渡の禁止）</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
                <li>医院は、当方の事前の承諾（電磁的な方法を含みます）なく、本契約上の地位、権利、義務を、第三者に譲渡し、承継させ、担保に供してはなりません。</li>
                <li>当方は、本サービスに関する事業を第三者に譲渡する場合、本契約上の地位、権利、義務と、患者データを、その第三者に承継させることができます。この場合、当方は、事前に医院に通知します。</li>
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第38条（分離可能性）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">本規約のいずれかの条項が、無効または執行できないと判断されても、他の条項は、有効に存続します。無効となった条項は、その趣旨に最も近い、有効な内容に置き換えて解釈します。</p>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-800">第39条（準拠法と管轄）</h3>
              <p className="text-sm text-gray-700 leading-relaxed">本規約は、日本法に基づいて解釈されます。本契約に関して紛争が生じたときは、東京地方裁判所を、第一審の専属的合意管轄裁判所とします。</p>
            </div>
          </section>

          <section className="space-y-2 border-t border-gray-100 pt-4">
            <h2 className="text-base font-bold text-gray-900">附則</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed">
              <li>施行日：2026年9月29日</li>
              <li>運営者：medipre</li>
              <li>代表者：金子太郎</li>
              <li>連絡先：support@medipre.jp</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
