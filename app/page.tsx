import DetailStage from "@/components/DetailStage"
import HeroStage from "@/components/HeroStage"
import ColorPicker from "@/components/ColorPicker"
import GesturePlayer from "@/components/GesturePlayer"

export default function Page() {
  return (
    <>
      <header>
        <div className="wrap">
          <div className="brand">
            iver<b>·</b>finne
          </div>
          <a className="nav" href="https://iverfinne.no" target="_blank" rel="noopener">
            iverfinne.no →
          </a>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <div className="hero-grid">
            <div>
              <h1 className="serif">
                musikk&shy;klossen
                <br />
                du <em>vrir</em> på.
              </h1>
              <p className="lede">
                Ein kloss du held i handa. Vri han ein veg så spelar musikken; vri han ein annan så
                hoppar han vidare. Inga skjerm, ingen knappar — berre form.
              </p>
              <div className="meta">
                <div>
                  <b>Form</b>half cylinder
                </div>
                <div>
                  <b>Kjerne</b>micro:bit V2
                </div>
                <div>
                  <b>Kropp</b>3D-printa kobolt
                </div>
              </div>
            </div>
            <div className="order2">
              <HeroStage />
            </div>
          </div>
        </section>

        <section className="block">
          <div className="two">
            <div>
              <div className="k">kropp</div>
              <h2 className="serif">Ein massiv liten ting.</h2>
              <p>
                Kvart-runden på toppen gjev klossen ei retning utan å rope om det. LED-rutenettet
                glør gjennom eit 1,2 mm skin — meir lampe enn skjerm. Kobolt, matt, med mjukt runda
                kantar; eit leiketøy-uttrykk i måla tre.
              </p>
              <p>
                Brettet sit ståande med 0,8 mm klaring og 5 mm luft til frontveggen så knappane går
                klar. USB-C ut høgre side. Skrur saman med ei baseplate og fire føter.
              </p>
            </div>
            <div className="detail-col">
              <DetailStage />
              <ul className="spec">
                <li>
                  <span>Ytre mål</span>
                  <span>62 × 60 × 42 mm</span>
                </li>
                <li>
                  <span>Veggtjukkelse</span>
                  <span>2,4 mm</span>
                </li>
                <li>
                  <span>LED-vindauge</span>
                  <span>1,2 mm skin</span>
                </li>
                <li>
                  <span>LED-rutenett</span>
                  <span>5 × 5 · 3,8 mm</span>
                </li>
                <li>
                  <span>Skruer</span>
                  <span>M2 sjølvgjengande</span>
                </li>
                <li>
                  <span>Print</span>
                  <span>FDM · kobolt PLA</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="block">
          <div className="two">
            <div>
              <div className="k">farge</div>
              <h2 className="serif">Din eigen kloss.</h2>
              <p>
                Kvar kloss vert 3D-printa i PLA — same form, ulikt pigment. Drei han rundt og vel
                fargen din.
              </p>
            </div>
            <ColorPicker />
          </div>
        </section>

        <section className="block">
          <div className="two">
            <div>
              <div className="k">styring</div>
              <h2 className="serif">Same vri, ekte styring.</h2>
              <p>
                Ingen knappar, ingen app. Vri klossen til høgre so spelar musikken; vri han til
                venstre so hoppar han vidare til neste spor. Eit lite trykk er pause.
              </p>
              <p>Prøv sjølv, under — same gest som den ekte klossen bruker.</p>
            </div>
            <GesturePlayer />
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div>© 2026 Iver Finne — half cylinder / musikkloss</div>
          <div>
            <a href="https://iverfinne.no" target="_blank" rel="noopener">
              iverfinne.no
            </a>
          </div>
        </div>
      </footer>
    </>
  )
}
