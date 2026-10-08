import java.io.File;
import java.io.FileInputStream;
import java.util.List;

import org.verapdf.gf.foundry.VeraGreenfieldFoundryProvider;
import org.verapdf.pdfa.Foundries;
import org.verapdf.pdfa.PDFAParser;
import org.verapdf.pdfa.PDFAValidator;
import org.verapdf.pdfa.flavours.PDFAFlavour;
import org.verapdf.pdfa.results.TestAssertion;
import org.verapdf.pdfa.results.ValidationResult;

/**
 * Prueft die uebergebenen Dateien gegen PDF/A-3B und beendet sich mit Code 1,
 * sobald eine davon nicht konform ist.
 *
 * Absichtlich klein: die Pruefregeln kommen vollstaendig aus veraPDF, hier
 * steht nur, welche Datei gegen welches Profil geprueft wird und wie das
 * Ergebnis ausgegeben wird. Ohne diese Pruefung waere "PDF/A-3B" eine
 * Behauptung -- und ohne PDF/A-3 gibt es kein gueltiges ZUGFeRD.
 */
public final class Verify {
  public static void main(String[] args) throws Exception {
    if (args.length == 0) {
      System.err.println("Aufruf: Verify <datei.pdf> [...]");
      System.exit(2);
    }
    VeraGreenfieldFoundryProvider.initialise();
    PDFAFlavour flavour = PDFAFlavour.PDFA_3_B;
    boolean failed = false;

    for (String path : args) {
      try (FileInputStream in = new FileInputStream(new File(path));
          PDFAParser parser = Foundries.defaultInstance().createParser(in, flavour)) {
        PDFAValidator validator = Foundries.defaultInstance().createValidator(flavour, false);
        ValidationResult result = validator.validate(parser);
        if (result.isCompliant()) {
          System.out.println("OK      PDF/A-3B  " + path);
          continue;
        }
        failed = true;
        System.out.println("FEHLER  PDF/A-3B  " + path);
        // Dieselbe Regel schlaegt oft auf jeder Seite an. Fuer die Ursache
        // zaehlt die Regel, nicht die Fundstelle -- darum pro Regel eine Zeile.
        List<TestAssertion> assertions = List.copyOf(result.getTestAssertions());
        assertions.stream()
            .filter(assertion -> assertion.getStatus() == TestAssertion.Status.FAILED)
            .map(assertion -> "        " + assertion.getRuleId().getClause()
                + " Test " + assertion.getRuleId().getTestNumber() + ": " + assertion.getMessage())
            .distinct()
            .forEach(System.out::println);
      }
    }
    System.exit(failed ? 1 : 0);
  }
}
